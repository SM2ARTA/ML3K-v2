/**
 * LP Plan Engine — bin-packing algorithm for truck loading
 * Full port from v1 LP_buildLoadPlan()
 *
 * WAREHOUSE MODEL: Stock accumulates from arrivals, trucks dispatched greedily when full loads possible
 * Two phases: main dispatch (full trucks only) + flush (remaining demand)
 */
import { isNonWorkday, addDays, nextWorkday, matchTransitAbbr } from './lp-helpers';

export interface PlanConfig {
	maxPallets: number;
	maxTrucks: number;
	maxDests: number;
	ricStartDate: string;
	nomenclature: Record<string, any>;
	startTruckId?: number;
	blockedDates?: string[];
	stockSkus?: string[];
	holds?: string[];
	excludeStaples?: boolean;
}

export interface PlanRow {
	date: string; truckId: number; destination: string; sku: string; name: string;
	qty: number; pallets: number; truckTotal?: number;
}

export function buildLoadPlan(demand: any[], arrivals: any[], cfg: PlanConfig): PlanRow[] {
	const MAX_PALLETS = cfg.maxPallets || 26;
	const MAX_TRUCKS_DAY = cfg.maxTrucks || 4;
	const MAX_DESTS_DAY = cfg.maxDests || 3;
	const START_TRUCK_ID = cfg.startTruckId || 0;
	const BLOCKED_DATES = new Set(cfg.blockedDates || []);
	const RIC_START = cfg.ricStartDate || '2026-04-01';
	const isRic = (d: string) => (d || '').toUpperCase().includes('RIC');
	const destAllowedOnDate = (dest: string, date: string) => isRic(dest) ? date >= RIC_START : true;

	if (!demand.length || !arrivals.length) return [];

	// Build nomenclature map
	const nomMap: Record<string, { palletQty: number; palletSpc: number; name: string }> = {};
	const cfgNom = cfg.nomenclature || {};
	for (const d of demand) {
		if (!nomMap[d.sku]) {
			const cn = cfgNom[d.sku];
			nomMap[d.sku] = { palletQty: cn?.palletQty || cn?.pallet_qty || d.palletQty || d.pallet_qty || 0, palletSpc: cn?.palletSpc || cn?.pallet_spc || d.palletSpc || d.pallet_spc || 0, name: cn?.name || d.name };
		}
	}

	const upp = (sku: string) => { const m = nomMap[sku]; return (m?.palletQty > 0 && m?.palletSpc > 0) ? m.palletQty / m.palletSpc : 0; };
	const u2spc = (sku: string, qty: number) => { const u = upp(sku); return u > 0 ? qty / u : 0; };
	const floorPallets = (sku: string, qty: number) => { const pq = nomMap[sku]?.palletQty || 0; const ps = nomMap[sku]?.palletSpc || 0; if (!pq || !ps) return 0; return Math.floor(qty / pq) * ps; };

	// Stock SKUs available from day 1
	const stockSkusSet = new Set(cfg.stockSkus || []);
	const rawArr = arrivals.filter((a: any) => a.qty > 0);
	const earliestReady = rawArr.length ? rawArr.reduce((m: string, a: any) => a.readyDate && a.readyDate < m ? a.readyDate : m, '9999') : '';
	const invEvents = (stockSkusSet.size && earliestReady !== '9999' ? rawArr.map((a: any) => stockSkusSet.has(a.sku) && a.readyDate > earliestReady ? { ...a, readyDate: earliestReady } : a) : rawArr).sort((a: any, b: any) => a.readyDate.localeCompare(b.readyDate));
	if (!invEvents.length) return [];

	// Build stock delta by date
	const stockDelta: Record<string, Record<string, number>> = {};
	for (const a of invEvents) { if (!stockDelta[a.readyDate]) stockDelta[a.readyDate] = {}; stockDelta[a.readyDate][a.sku] = (stockDelta[a.readyDate][a.sku] || 0) + a.qty; }

	const isTruck = (d: string) => { const u = (d || '').toUpperCase(); return u.includes('MEX') || u.includes('CAN') || u.includes('RIC') || u.includes('TORONTO') || u.includes('VANCOUVER') || u.includes('HOUSTON') || u.includes('KANSAS') || u.includes('NEW YORK') || u.includes('GUADAL') || u.includes('MONTER') || u.includes('MEXICO'); };
	const pri = (d: string) => { const u = (d || '').toUpperCase(); return u.includes('MEX') || u.includes('GUADAL') || u.includes('MONTER') || u.includes('CDMX') ? 0 : u.includes('CAN') || u.includes('TORONTO') || u.includes('VANCOUVER') ? 1 : 2; };

	const nomRef = cfg.nomenclature || {};
	const isExcludedSrc = (sku: string, dest: string) => {
		const s = (nomRef[sku]?.source || '').toUpperCase().trim();
		if (s === 'STP CAN' || s === 'STP MEX') return true;
		if (s === 'STP USA' && cfg.excludeStaples !== false) { const a = matchTransitAbbr(dest); return a === 'HOU' || a === 'KC' || a === 'NY'; }
		return false;
	};

	const holdsSet = new Set(cfg.holds || []);
	const arrivedSkus = new Set(invEvents.map((a: any) => a.sku));

	// Build demand queues
	const demandQueue: Record<string, Record<string, { id: string; qty: number; remain: number }[]>> = {};
	const remainDemand: Record<string, Record<string, number>> = {};
	for (const d of demand) {
		if (!isTruck(d.destination)) continue;
		if (isExcludedSrc(d.sku, d.destination)) continue;
		if (holdsSet.has(d.destination + '|' + d.sku)) continue;
		if (!arrivedSkus.has(d.sku)) continue;
		if (!demandQueue[d.destination]) demandQueue[d.destination] = {};
		if (!demandQueue[d.destination][d.sku]) demandQueue[d.destination][d.sku] = [];
		if (!remainDemand[d.destination]) remainDemand[d.destination] = {};
		if (!remainDemand[d.destination][d.sku]) remainDemand[d.destination][d.sku] = 0;
		const qty = d.requiredQty || d.required_qty || 0;
		const id = d.uid || d.id || `R${demand.indexOf(d)}`;
		demandQueue[d.destination][d.sku].push({ id, qty, remain: qty });
		remainDemand[d.destination][d.sku] += qty;
	}

	// Proportional allocation if demand > supply
	const totalInv: Record<string, number> = {};
	for (const a of invEvents) totalInv[a.sku] = (totalInv[a.sku] || 0) + a.qty;
	for (const sku of arrivedSkus) {
		const cap = totalInv[sku] || 0;
		let totalDem = 0;
		for (const dest of Object.keys(remainDemand)) totalDem += remainDemand[dest]?.[sku] || 0;
		if (totalDem <= cap) continue;
		const ratio = cap / totalDem;
		for (const dest of Object.keys(demandQueue)) {
			if (!demandQueue[dest][sku]) continue;
			let destAlloc = Math.floor((remainDemand[dest][sku] || 0) * ratio);
			const pq = nomMap[sku]?.palletQty || 0;
			if (pq > 0) destAlloc = Math.floor(destAlloc / pq) * pq;
			remainDemand[dest][sku] = destAlloc;
			let keep = destAlloc;
			demandQueue[dest][sku] = demandQueue[dest][sku].filter(item => {
				if (keep <= 0) return false;
				if (item.qty <= keep) { keep -= item.qty; return true; }
				item.remain = keep; item.qty = keep; keep = 0; return true;
			});
		}
	}

	// Iterate dates
	const stock: Record<string, number> = {};
	const iterDates: string[] = [];
	let cur = invEvents[0].readyDate;
	for (let i = 0; i < 365; i++) { if (!isNonWorkday(cur)) iterDates.push(cur); cur = addDays(cur, 1); }

	const plan: PlanRow[] = [];
	let truckId = START_TRUCK_ID;
	const totalRemain = () => Object.values(remainDemand).reduce((s, d) => s + Object.values(d).reduce((a, b) => a + b, 0), 0);

	// ── Main dispatch phase ──
	for (const date of iterDates) {
		if (stockDelta[date]) for (const [sku, qty] of Object.entries(stockDelta[date])) stock[sku] = (stock[sku] || 0) + qty;
		if (totalRemain() <= 0) break;
		if (BLOCKED_DATES.has(date)) continue;

		const allScored = Object.keys(demandQueue).filter(dest => destAllowedOnDate(dest, date)).map(dest => {
			let s = 0;
			for (const sku of Object.keys(demandQueue[dest] || {})) { const rem = remainDemand[dest]?.[sku] || 0; if (rem <= 0) continue; s += floorPallets(sku, Math.min(rem, stock[sku] || 0)); }
			return { dest, score: s };
		}).filter(x => x.score > 0).sort((a, b) => b.score - a.score || pri(a.dest) - pri(b.dest));

		const allowedDests = new Set<string>();
		for (const { dest } of allScored) { if (allowedDests.size >= MAX_DESTS_DAY) break; allowedDests.add(dest); }

		let trucksToday = 0, madeProgress = true;
		while (madeProgress && trucksToday < MAX_TRUCKS_DAY) {
			madeProgress = false;
			const scored = Object.keys(demandQueue).filter(dest => destAllowedOnDate(dest, date)).map(dest => {
				let s = 0;
				for (const sku of Object.keys(demandQueue[dest] || {})) { const rem = remainDemand[dest]?.[sku] || 0; if (rem <= 0) continue; s += floorPallets(sku, Math.min(rem, stock[sku] || 0)); }
				return { dest, score: s };
			}).filter(x => x.score > 0 && allowedDests.has(x.dest)).sort((a, b) => b.score - a.score || pri(a.dest) - pri(b.dest));

			for (const { dest } of scored) {
				if (trucksToday >= MAX_TRUCKS_DAY) break;
				const skus = Object.keys(demandQueue[dest]).filter(sku => (remainDemand[dest][sku] || 0) > 0 && (stock[sku] || 0) > 0);
				let spacesAvail = 0;
				for (const sku of skus) spacesAvail += floorPallets(sku, Math.min(remainDemand[dest][sku] || 0, stock[sku] || 0));
				if (spacesAvail < 1) continue;

				// Wait for full load unless no more arrivals coming
				if (spacesAvail < MAX_PALLETS) {
					const hasFuture = invEvents.some((a: any) => a.readyDate > date && (remainDemand[dest]?.[a.sku] || 0) > 0 && a.qty > 0);
					if (hasFuture) continue;
				}

				truckId++;
				const rows: PlanRow[] = [];
				let spacesLoaded = 0;

				for (const sku of skus) {
					if (spacesLoaded >= MAX_PALLETS) break;
					const spacesLeft = MAX_PALLETS - spacesLoaded;
					const canUse = Math.min(remainDemand[dest][sku] || 0, stock[sku] || 0);
					const wholeSpc = Math.min(floorPallets(sku, canUse), spacesLeft);
					if (wholeSpc < 1) continue;
					const targetUnits = wholeSpc * upp(sku);

					// Pick from demand queue
					let pickedUnits = 0;
					const idList = demandQueue[dest][sku];
					for (const item of [...idList].sort((a, b) => b.remain - a.remain)) {
						if (pickedUnits >= targetUnits - 0.001) break;
						const take = Math.min(item.remain, targetUnits - pickedUnits);
						rows.push({ date, truckId, destination: dest, sku, name: nomMap[sku]?.name || sku, qty: Math.round(take), pallets: u2spc(sku, take) });
						remainDemand[dest][sku] -= take;
						stock[sku] -= take;
						item.remain -= take;
						pickedUnits += take;
						if (item.remain < 0.001) { const idx = idList.indexOf(item); if (idx >= 0) idList.splice(idx, 1); }
					}
					spacesLoaded += wholeSpc;
				}

				if (!rows.length) { truckId--; continue; }
				for (const r of rows) plan.push({ ...r, truckTotal: spacesLoaded });
				trucksToday++;
				madeProgress = true;
			}
		}
	}

	// ── Flush remaining demand ──
	const advancePastBlocked = (d: string) => { let dt = d; while (BLOCKED_DATES.has(dt)) dt = nextWorkday(addDays(dt, 1)); return dt; };
	const lastDate = plan.length ? plan[plan.length - 1].date : iterDates[0];
	let flushDate = advancePastBlocked(lastDate);
	let flushTrucksToday = flushDate === lastDate ? new Set(plan.filter(r => r.date === lastDate).map(r => r.truckId)).size : 0;
	if (flushTrucksToday >= MAX_TRUCKS_DAY) { flushDate = advancePastBlocked(nextWorkday(addDays(flushDate, 1))); flushTrucksToday = 0; }

	const flushDests = Object.keys(demandQueue).filter(dest => Object.values(remainDemand[dest] || {}).some(v => v > 0.001)).sort((a, b) => pri(a) - pri(b));
	let flushDestsToday = new Set<string>();

	for (const dest of flushDests) {
		if (isRic(dest) && flushDate < RIC_START) {
			flushDate = advancePastBlocked(RIC_START);
			flushTrucksToday = 0;
			flushDestsToday = new Set();
		}
		if (!flushDestsToday.has(dest) && flushDestsToday.size >= MAX_DESTS_DAY) {
			flushDate = advancePastBlocked(nextWorkday(addDays(flushDate, 1)));
			flushTrucksToday = 0;
			flushDestsToday = new Set();
		}
		flushDestsToday.add(dest);

		let keepGoing = true;
		while (keepGoing) {
			if (flushTrucksToday >= MAX_TRUCKS_DAY) {
				flushDate = advancePastBlocked(nextWorkday(addDays(flushDate, 1)));
				flushTrucksToday = 0;
				flushDestsToday = new Set();
				flushDestsToday.add(dest);
			}

			const skus = Object.keys(demandQueue[dest]).filter(sku => (remainDemand[dest][sku] || 0) > 0.001);
			if (!skus.length) break;

			truckId++;
			const rows: PlanRow[] = [];
			let spacesLoaded = 0;
			keepGoing = false;

			for (const sku of skus) {
				if (spacesLoaded >= MAX_PALLETS) break;
				const rem = remainDemand[dest][sku] || 0;
				if (rem < 0.001) continue;

				const pq = nomMap[sku]?.palletQty || 0;
				const spacesLeft = MAX_PALLETS - spacesLoaded;
				const wholeSpc = Math.min(floorPallets(sku, rem), spacesLeft);
				const partialUnits = pq > 0 ? rem % pq : 0;
				const includePartial = partialUnits > 0.001 && u2spc(sku, partialUnits) <= spacesLeft - wholeSpc * (nomMap[sku]?.palletSpc || 0);
				const targetUnits = wholeSpc * upp(sku) + (includePartial ? partialUnits : 0);
				if (targetUnits < 0.001) continue;

				const idList = demandQueue[dest][sku];
				let pickedUnits = 0;
				for (const item of [...idList].sort((a, b) => b.remain - a.remain)) {
					if (pickedUnits >= targetUnits - 0.001) break;
					const take = Math.min(item.remain, targetUnits - pickedUnits);
					rows.push({ date: flushDate, truckId, destination: dest, sku, name: nomMap[sku]?.name || sku, qty: Math.round(take), pallets: u2spc(sku, take) });
					remainDemand[dest][sku] -= take;
					item.remain -= take;
					pickedUnits += take;
					if (item.remain < 0.001) { const idx = idList.indexOf(item); if (idx >= 0) idList.splice(idx, 1); }
				}
				spacesLoaded += u2spc(sku, pickedUnits);
				if ((remainDemand[dest][sku] || 0) > 0.001) keepGoing = true;
			}

			if (!rows.length) { truckId--; break; }
			const total = rows.reduce((s, r) => s + r.pallets, 0);
			for (const r of rows) plan.push({ ...r, truckTotal: +total.toFixed(4) });
			flushTrucksToday++;
		}
	}

	return plan;
}

/** Calculate arrival date from dispatch date + transit days */
export function getArrivalDate(dispatchDate: string, destination: string, transitDays: Record<string, number>): string {
	const abbr = matchTransitAbbr(destination);
	const days = transitDays[abbr] || 3;
	return addDays(dispatchDate, days);
}

/** Get transit days for a destination */
export function getTransitDays(destination: string, transitDays: Record<string, number>): number {
	const abbr = matchTransitAbbr(destination);
	return transitDays[abbr] || 3;
}
