/**
 * LM Plan Engine — simplified pallet calculation + truck packing
 * Core logic ported from v1 build() function (lines 6930-7400)
 *
 * Simplified version focuses on:
 * - Pallet calculation (qty / pallet_qty * pallet_spc)
 * - Date grouping by bump-in date
 * - Truck packing respecting capacity and max trucks/day
 * - Lead time calculation (dispatch = bump_in - lead_time, skip weekends)
 */

import { addDays, isNonWorkday } from './lp-helpers';

export interface LMPlanConfig {
	truckCapacity: number;    // pallets per truck (default 26)
	maxTrucksPerDay: number;  // max trucks dispatched per day (default 2)
	leadTime: number;         // days before bump-in to dispatch (default 3)
}

export interface LMTruckDay {
	bumpInDate: string;
	dispatchDate: string;
	trucks: LMTruck[];
	totalPallets: number;
	totalPieces: number;
}

export interface LMTruck {
	items: LMTruckItem[];
	pallets: number;
	pieces: number;
}

export interface LMTruckItem {
	sku: string;
	name: string;
	qty: number;
	pallets: number;
	palletQty: number;
	palletSpc: number;
	bumpInDate: string;
}

/** Calculate dispatch date: bump_in - lead_time, skipping weekends/holidays */
function calcDispatchDate(bumpInDate: string, leadTime: number): string {
	let d = bumpInDate;
	let remaining = leadTime;
	while (remaining > 0) {
		d = addDays(d, -1);
		if (!isNonWorkday(d)) remaining--;
	}
	return d;
}

/** Build LM plan for a venue */
export function buildLMPlan(
	demand: { sku: string; name: string; qty: number; bumpInDate: string; palletQty: number; palletSpc: number }[],
	config: LMPlanConfig
): LMTruckDay[] {
	const { truckCapacity, maxTrucksPerDay, leadTime } = config;

	// Filter items with valid pallet data and qty
	const validItems = demand.filter(d => d.palletQty > 0 && d.palletSpc > 0 && d.qty > 0);
	if (!validItems.length) return [];

	// Group by bump-in date
	const byDate = new Map<string, typeof validItems>();
	for (const item of validItems) {
		const date = item.bumpInDate || 'unknown';
		if (!byDate.has(date)) byDate.set(date, []);
		byDate.get(date)!.push(item);
	}

	const days: LMTruckDay[] = [];

	for (const [biDate, items] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (biDate === 'unknown') continue;

		// Calculate pallets for each item
		const loadList: LMTruckItem[] = items.map(item => ({
			sku: item.sku,
			name: item.name,
			qty: item.qty,
			pallets: Math.round(((item.qty / item.palletQty) * item.palletSpc) * 100) / 100,
			palletQty: item.palletQty,
			palletSpc: item.palletSpc,
			bumpInDate: biDate
		})).sort((a, b) => b.pallets - a.pallets); // largest items first

		// Pack into trucks
		const trucks: LMTruck[] = [];
		let currentTruck: LMTruck = { items: [], pallets: 0, pieces: 0 };
		trucks.push(currentTruck);

		for (const item of loadList) {
			let remaining = item.pallets;
			let remainQty = item.qty;

			while (remaining > 0.001) {
				const space = truckCapacity - currentTruck.pallets;

				if (space >= remaining - 0.001) {
					// Fits entirely
					currentTruck.items.push({ ...item, qty: remainQty, pallets: Math.round(remaining * 100) / 100 });
					currentTruck.pallets += remaining;
					currentTruck.pieces += remainQty;
					remaining = 0;
				} else {
					// Partial fit
					if (space > 0.001 && item.palletSpc > 0) {
						const fitPallets = Math.floor(space / item.palletSpc) * item.palletSpc;
						if (fitPallets > 0) {
							const fitQty = Math.round(fitPallets / item.palletSpc * item.palletQty);
							currentTruck.items.push({ ...item, qty: fitQty, pallets: Math.round(fitPallets * 100) / 100 });
							currentTruck.pallets += fitPallets;
							currentTruck.pieces += fitQty;
							remaining -= fitPallets;
							remainQty -= fitQty;
						}
					}

					// Start new truck if allowed
					if (trucks.length < maxTrucksPerDay) {
						currentTruck = { items: [], pallets: 0, pieces: 0 };
						trucks.push(currentTruck);
					} else {
						// Overflow — carry to next day (simplified: just add to this day's last truck)
						if (remaining > 0.001) {
							currentTruck.items.push({ ...item, qty: remainQty, pallets: Math.round(remaining * 100) / 100 });
							currentTruck.pallets += remaining;
							currentTruck.pieces += remainQty;
						}
						remaining = 0;
					}
				}
			}
		}

		// Calculate dispatch date
		const dispatchDate = calcDispatchDate(biDate, leadTime);

		// Finalize
		const activeTrucks = trucks.filter(t => t.items.length > 0);
		activeTrucks.forEach(t => { t.pallets = Math.round(t.pallets * 100) / 100; });

		if (activeTrucks.length > 0) {
			days.push({
				bumpInDate: biDate,
				dispatchDate,
				trucks: activeTrucks,
				totalPallets: activeTrucks.reduce((s, t) => s + t.pallets, 0),
				totalPieces: activeTrucks.reduce((s, t) => s + t.pieces, 0)
			});
		}
	}

	return days;
}
