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

/** Get CI party data based on destination */
function getCIParties(dest: string) {
	const u = (dest || '').toUpperCase();
	if (u.includes('TORONTO') || u.includes('VANCOUVER') || u.includes('CAN'))
		return {
			consignee: ['FWC26 Canada Football Ltd', '67 Mowat Avenue, Ste# 200', 'Toronto, ON M6K3E3', 'Canada', 'Business no: 773064001RM0001', ''],
			broker: ['Rock It Cargo Canada', 'c/o Pacific Customs Broker', '', 'Contact: fifa.canada@rockitcargo.com', '', '']
		};
	if (u.includes('MEXICO') || u.includes('GUADAL') || u.includes('MONTER') || u.includes('MEX'))
		return {
			consignee: ['FWC2026 Mexico, S. De R.L. de C.V.', 'Av Paseo de la Reforma 350 - Piso 12', 'Col. Juarez, Alcaldia Cuauhtemoc', 'CP0660, CDMX', 'Mexico', ''],
			broker: ['Cargolive, S.DE R.L.DE C.V.', 'Platon #409 - Colonia Poloanco V Seccion', 'Alcaldia Miguel Hidalgo - C.P. 11560 CDMX', 'MEXICO', 'Contact: fifa.mexico@rockitcargo.com', '']
		};
	return { consignee: ['', '', '', '', '', ''], broker: ['', '', '', '', '', ''] };
}

/** Export Commercial Invoice + Packing List for a single truck (SheetJS) */
export function exportCI(
	truckId: number,
	planRows: any[],
	nomenclature: Record<string, any>,
	customsOverrides: Record<string, any>
) {
	const items = planRows.filter(r => r.truck_id === truckId);
	if (!items.length) return;

	const dest = items[0].destination || '';
	const date = items[0].dispatch_date || '';
	const wb = XLSX.utils.book_new();

	// Aggregate by SKU
	const skuMap = new Map<string, { sku: string; name: string; qty: number; pallets: number }>();
	for (const r of items) {
		if (!skuMap.has(r.sku)) skuMap.set(r.sku, { sku: r.sku, name: r.name || '', qty: 0, pallets: 0 });
		const s = skuMap.get(r.sku)!;
		s.qty += r.qty || 0;
		s.pallets += r.pallets || 0;
	}
	const agg = [...skuMap.values()];
	const totalPlt = agg.reduce((s, r) => s + r.pallets, 0);

	// Helper: get customs data with override fallback
	function custNom(sku: string) {
		const n = nomenclature[sku] || {};
		const o = customsOverrides[sku] || {};
		return {
			name: o.customs_name || n.customs_name || n.name || '',
			hsCode: o.hs_code || n.hs_code || '',
			country: o.country || n.country || '',
			unitPrice: o.price !== undefined ? o.price : (n.unit_price || 0)
		};
	}

	// Sheet 1: Commercial Invoice
	let tQ = 0, tV = 0;
	const ciRows = agg.map(it => {
		const nm = custNom(it.sku);
		const up = nm.unitPrice || 0;
		const tv = it.qty * up;
		tQ += it.qty; tV += tv;
		return {
			'QTY': it.qty, 'DESCRIPTION': nm.name || it.name || it.sku, 'ITEM #': it.sku,
			'HS CODE': nm.hsCode, 'COUNTRY': nm.country, 'CURRENCY': 'USD',
			'UNIT VALUE': up, 'TOTAL VALUE': tv, 'Pallets': +it.pallets.toFixed(2)
		};
	});
	ciRows.push({ 'QTY': tQ, 'DESCRIPTION': 'TOTAL', 'ITEM #': '', 'HS CODE': '', 'COUNTRY': '', 'CURRENCY': '', 'UNIT VALUE': '', 'TOTAL VALUE': tV, 'Pallets': +totalPlt.toFixed(2) } as any);

	const pty = getCIParties(dest);
	const ciHeader = [
		['COMBINED INVOICE AND PACKING LIST'], [''],
		['DATE:', date, '', 'INVOICE #:', 'LP-' + truckId + '-' + date],
		['DELIVERY LOCATION:', dest],
		['Incoterms:', 'DDP', 'Terms of Payment:', 'Freight Prepaid'],
		['Mode of Transport:', 'Road'], [''],
		['SHIPPER:', 'FWC2026 US, Inc, 396 Alhambra Circle, Ste# 400, Coral Gables, FL 33134, USA'],
		['CONSIGNEE:', pty.consignee.filter(Boolean).join(', ')],
		['CUSTOMS BROKER:', pty.broker.filter(Boolean).join(', ')], ['']
	];
	const ws = XLSX.utils.aoa_to_sheet(ciHeader);
	XLSX.utils.sheet_add_json(ws, ciRows, { origin: 'A12' });
	ws['!cols'] = [{ wch: 8 }, { wch: 36 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
	XLSX.utils.book_append_sheet(wb, ws, 'Commercial Invoice');

	// Sheet 2: Packing List
	const plHeader = [
		['PACKING LIST'], [''],
		['Truck:', 'LP-' + truckId, 'Date:', date, 'Destination:', dest],
		['Items:', tQ, 'Pallets:', +totalPlt.toFixed(2), 'Total Value:', tV], ['']
	];
	const plRows = agg.map((it, i) => {
		const nm = custNom(it.sku);
		const up = nm.unitPrice || 0;
		return { '#': i + 1, 'Code': it.sku, 'Name': nm.name || it.name || it.sku, 'Qty': it.qty, 'Pallets': +it.pallets.toFixed(3), 'HS Code': nm.hsCode, 'Country': nm.country, 'Unit Price': up, 'Line Total': up * it.qty };
	});
	plRows.push({ '#': '' as any, 'Code': '', 'Name': 'TOTAL', 'Qty': tQ, 'Pallets': +totalPlt.toFixed(2), 'HS Code': '', 'Country': '', 'Unit Price': '' as any, 'Line Total': tV });
	const ps = XLSX.utils.aoa_to_sheet(plHeader);
	XLSX.utils.sheet_add_json(ps, plRows, { origin: 'A6' });
	ps['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
	XLSX.utils.book_append_sheet(wb, ps, 'Packing List');

	XLSX.writeFile(wb, `CI_T${truckId}_${dest.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
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

// ── LM Exports ──

/** Export LM demand data */
export function exportLMDemand(demand: any[], nomMap: Record<string, any>) {
	if (!demand.length) return;
	const wb = XLSX.utils.book_new();
	const rows = demand.map(d => {
		const nom = nomMap[d.sku] || {};
		return {
			'Venue': d.venue, 'SKU': d.sku, 'Name': nom.name || d.sku,
			'Qty': d.required_qty || 0, 'Bump-in Date': d.bump_in_date || '',
			'Cluster': d.venue_cluster || '', 'Type': d.venue_type || '',
			'Source': nom.source || '', 'Pallet Qty': nom.pallet_qty || '', 'Pallet Spc': nom.pallet_spc || ''
		};
	});
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }];
	XLSX.utils.book_append_sheet(wb, ws, 'LM Demand');
	XLSX.writeFile(wb, `LM-Demand-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Export LM venue summary */
export function exportLMVenues(venueStats: any[]) {
	if (!venueStats.length) return;
	const wb = XLSX.utils.book_new();
	const rows = venueStats.map(v => ({
		'Venue': v.venue, 'Cluster': v.cluster, 'Type': v.venueType,
		'SKUs': v.skuCount, 'Total Qty': v.qty, 'Pallets': +v.pallets.toFixed(1),
		'Earliest Bump-in': v.earliestBI || ''
	}));
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
	XLSX.utils.book_append_sheet(wb, ws, 'LM Venues');
	XLSX.writeFile(wb, `LM-Venues-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Export LM truck plan for a venue */
export function exportLMTruckPlan(
	plan: { bumpInDate: string; dispatchDate: string; trucks: { items: { sku: string; name: string; qty: number; pallets: number }[]; pallets: number; pieces: number; isCORT?: boolean }[]; totalPallets: number; totalPieces: number }[],
	venue: string,
	truckCapacity: number
) {
	if (!plan.length) return;
	const wb = XLSX.utils.book_new();
	const now = new Date().toISOString().slice(0, 10);

	// Sheet 1: Truck details
	const rows: any[] = [];
	let truckNum = 0;
	for (const day of plan) {
		for (const truck of day.trucks) {
			truckNum++;
			const label = truck.isCORT ? 'CORT' : 'T-' + truckNum;
			for (const item of truck.items) {
				rows.push({
					'Truck': label, 'Dispatch': day.dispatchDate, 'Bump-in': day.bumpInDate,
					'SKU': item.sku, 'Name': item.name, 'Qty': item.qty,
					'Pallets': +item.pallets.toFixed(3),
					'CORT': truck.isCORT ? 'Yes' : ''
				});
			}
		}
	}
	const ws = XLSX.utils.json_to_sheet(rows);
	ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 6 }];
	XLSX.utils.book_append_sheet(wb, ws, 'Truck Plan');

	// Sheet 2: Summary
	const summary: any[] = [];
	truckNum = 0;
	for (const day of plan) {
		for (const truck of day.trucks) {
			truckNum++;
			summary.push({
				'Truck': truck.isCORT ? 'CORT' : 'T-' + truckNum,
				'Dispatch': day.dispatchDate, 'Bump-in': day.bumpInDate,
				'Pallets': +truck.pallets.toFixed(1), 'Pieces': truck.pieces,
				'SKUs': truck.items.length,
				'Utilization': Math.round((truck.pallets / truckCapacity) * 100) + '%',
				'CORT': truck.isCORT ? 'Yes' : ''
			});
		}
	}
	const ws2 = XLSX.utils.json_to_sheet(summary);
	ws2['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 10 }, { wch: 6 }];
	XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

	const safeName = venue.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
	XLSX.writeFile(wb, `LM-Trucks-${safeName}-${now}.xlsx`);
}

/** Export V26 summary */
export function exportV26Summary(destSummary: any[], timeline: any[], stats: any) {
	const wb = XLSX.utils.book_new();
	// Dest breakdown
	if (destSummary.length) {
		const rows = destSummary.map(d => ({
			'Destination': d.dest, 'Trucks': d.trucks, 'Pallets': +d.pallets.toFixed(1),
			'Pieces': d.qty, 'Dispatched': d.dispatched
		}));
		const ws = XLSX.utils.json_to_sheet(rows);
		XLSX.utils.book_append_sheet(wb, ws, 'By Destination');
	}
	// Timeline
	if (timeline.length) {
		const rows = timeline.map(d => ({
			'Date': d.date, 'Trucks': d.trucks, 'Pallets': +d.pallets.toFixed(1),
			'Pieces': d.qty, 'Dispatched': d.dispatched
		}));
		const ws = XLSX.utils.json_to_sheet(rows);
		XLSX.utils.book_append_sheet(wb, ws, 'Timeline');
	}
	XLSX.writeFile(wb, `V26-Summary-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
