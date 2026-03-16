/**
 * Excel export utilities for LP module
 * Uses SheetJS (xlsx) for plan exports and ExcelJS for CI exports
 */
import * as XLSX from 'xlsx';

interface PlanRow {
	truck_id: number; dispatch_date: string; destination: string;
	sku: string; name: string; qty: number; pallets: number;
}

interface TruckDispatch {
	truck_id: number; dispatched: boolean; lsr_number: string;
}

interface Destination {
	abbr: string; name: string; transit_days: number;
}

/** Export LP Plan to Excel (SheetJS) */
export function exportLPPlan(
	planRows: PlanRow[],
	dispatch: TruckDispatch[],
	destinations: Destination[],
	maxPallets: number
) {
	if (!planRows.length) return;
	const wb = XLSX.utils.book_new();
	const dispSet = new Set(dispatch.filter(d => d.dispatched).map(d => d.truck_id));
	const lsrMap = new Map(dispatch.map(d => [d.truck_id, d.lsr_number || '']));

	// Group by truck
	const truckMap = new Map<number, { id: number; date: string; dest: string; items: PlanRow[] }>();
	for (const r of planRows) {
		if (!truckMap.has(r.truck_id)) {
			truckMap.set(r.truck_id, { id: r.truck_id, date: r.dispatch_date, dest: r.destination, items: [] });
		}
		truckMap.get(r.truck_id)!.items.push(r);
	}

	const trucks = [...truckMap.values()].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);

	// Sheet 1: Full plan
	const rows: any[] = [];
	for (const t of trucks) {
		// Aggregate by SKU within truck
		const skuMap = new Map<string, { sku: string; name: string; qty: number; pallets: number }>();
		for (const r of t.items) {
			if (!skuMap.has(r.sku)) skuMap.set(r.sku, { sku: r.sku, name: r.name || '', qty: 0, pallets: 0 });
			const s = skuMap.get(r.sku)!;
			s.qty += r.qty || 0;
			s.pallets += r.pallets || 0;
		}
		for (const s of skuMap.values()) {
			rows.push({
				'Truck': 'LP-' + t.id, 'Date': t.date, 'Destination': t.dest,
				'SKU': s.sku, 'Name': s.name, 'Qty': s.qty,
				'Pallets': +s.pallets.toFixed(2),
				'Locked': dispSet.has(t.id) ? 'Yes' : '',
				'LSR': lsrMap.get(t.id) || ''
			});
		}
	}
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
	XLSX.utils.book_append_sheet(wb, ws, 'Load Plan');

	// Sheet 2: Truck summary
	const summary = trucks.map(t => {
		const plt = t.items.reduce((s, r) => s + (r.pallets || 0), 0);
		const qty = t.items.reduce((s, r) => s + (r.qty || 0), 0);
		const skus = new Set(t.items.map(r => r.sku)).size;
		return {
			'Truck': 'LP-' + t.id, 'Date': t.date, 'Destination': t.dest,
			'Pallets': +plt.toFixed(1), 'Pieces': qty, 'SKUs': skus,
			'Utilization': Math.round((plt / maxPallets) * 100) + '%',
			'Locked': dispSet.has(t.id) ? 'Yes' : '',
			'LSR': lsrMap.get(t.id) || ''
		};
	});
	const ws2 = XLSX.utils.json_to_sheet(summary);
	ws2['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
	XLSX.utils.book_append_sheet(wb, ws2, 'Truck Summary');

	// Download
	const now = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, `LP-Plan-${now}.xlsx`);
}

/** Export LP Demand to Excel (SheetJS) */
export function exportLPDemand(data: any[]) {
	if (!data.length) return;
	const wb = XLSX.utils.book_new();
	const rows = data.map(d => ({
		'SKU': d.sku, 'Name': d.name, 'Source': d.source,
		'Total Qty': d.totalQty, 'Stock Qty': d.stockQty ?? '',
		'Price': d.unit_price || '', 'HS Code': d.hs_code || '',
		'Country': d.country || '', 'Customs Name': d.customs_name || '',
		'HS Confirmed': d.hs_confirmed ? 'Yes' : '',
		'Pallet Qty': d.pallet_qty || '', 'Pallets': d.totalPallets ? +d.totalPallets.toFixed(2) : ''
	}));
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 20 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 8 }];
	XLSX.utils.book_append_sheet(wb, ws, 'Demand');
	XLSX.writeFile(wb, `LP-Demand-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Export LP Arrivals to Excel */
export function exportLPArrivals(arrivals: any[]) {
	if (!arrivals.length) return;
	const wb = XLSX.utils.book_new();
	const rows = arrivals.map(a => ({
		'SKU': a.sku, 'Name': a.name || '', 'Container': a.container || '',
		'Qty': a.qty || 0, 'Arrival Date': a.arrival_date || '',
		'Ready Date': a.ready_date || '', 'Pallets': a.avail_pallets ? +a.avail_pallets.toFixed(2) : '',
		'Manual': a.is_manual ? 'Yes' : ''
	}));
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 20 }, { wch: 36 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
	XLSX.utils.book_append_sheet(wb, ws, 'Arrivals');
	XLSX.writeFile(wb, `LP-Arrivals-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
