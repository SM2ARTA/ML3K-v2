/** LP Excel file parsers — ported from v1 */
import * as XLSX from 'xlsx';
import { parseExcelDate, makeGC, nextWorkday, addDays } from './lp-helpers';

export function parseNomenclature(buf: ArrayBuffer): Record<string, any> {
	const wb = XLSX.read(buf, { type: 'array', cellDates: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
	let hr = 0;
	for (let i = 0; i < Math.min(10, rows.length); i++) {
		const r = rows[i].map(c => String(c).trim().toLowerCase());
		if (r.some(c => c.includes('nomenclature') || c.includes('pallet'))) { hr = i; break; }
	}
	const headers = rows[hr].map(c => String(c).trim().toLowerCase());
	const gc = makeGC(headers);
	const skuCol = gc('nomenclature code', 'sku', 'code');
	const nameCol = gc('nomenclature name', 'name', 'description');
	const sourceCol = gc('source', 'source sku', 'supplier');
	const pqCol = gc('pallet quantity, disassembled', 'pallet quantity', 'pallet qty', 'units per pallet');
	const psCol = gc('pallet spaces, disassembled', 'pallet spaces', 'spaces', 'pallet space');
	const hsCol = gc('hs code', 'harmonized code', 'tariff code', 'hts code', 'hs');
	const cooCol = gc('country of origin', 'country of manufacture', 'country', 'origin', 'made in');
	const priceCol = gc('unit price', 'price', 'unit value', 'value', 'cost', 'unit cost');
	if (skuCol < 0) throw new Error('Cannot find Nomenclature code column.');
	const nomen: Record<string, any> = {};
	for (let i = hr + 1; i < rows.length; i++) {
		const row = rows[i];
		const sku = String(row[skuCol] || '').trim();
		if (!sku) continue;
		nomen[sku] = {
			name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
			source: sourceCol >= 0 ? String(row[sourceCol] || '').trim() : '',
			palletQty: pqCol >= 0 ? (parseFloat(row[pqCol]) || 0) : 0,
			palletSpc: psCol >= 0 ? (parseFloat(row[psCol]) || 0) : 0,
			hsCode: hsCol >= 0 ? String(row[hsCol] || '').trim() : '',
			country: cooCol >= 0 ? String(row[cooCol] || '').trim() : '',
			unitPrice: priceCol >= 0 ? (parseFloat(row[priceCol]) || 0) : 0
		};
	}
	return nomen;
}

export function parseMaterialPlan(buf: ArrayBuffer): any[] {
	const wb = XLSX.read(buf, { type: 'array', cellDates: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
	let hr = 0;
	for (let i = 0; i < Math.min(10, rows.length); i++) {
		const r = rows[i].map(c => String(c).trim().toLowerCase());
		if (r.some(c => c.includes('venue cluster') || c.includes('destination') || c.includes('required'))) { hr = i; break; }
	}
	const headers = rows[hr].map(c => String(c).trim().toLowerCase());
	const gc = makeGC(headers);
	let destCol = headers.findIndex(h => h === 'venue cluster');
	if (destCol < 0) destCol = headers.findIndex(h => h.includes('venue cluster'));
	if (destCol < 0) destCol = gc('destination', 'warehouse');
	const skuCol = gc('nomenclature', 'nomenclature code', 'sku', 'code', 'item');
	const qtyCol = gc('required', 'qty', 'quantity', 'units');
	if (destCol < 0 || skuCol < 0) throw new Error('Cannot find Venue cluster and Nomenclature columns.');
	const demand: any[] = [];
	for (let i = hr + 1; i < rows.length; i++) {
		const row = rows[i];
		const dest = String(row[destCol] || '').trim();
		const sku = String(row[skuCol] || '').trim();
		if (!dest || !sku) continue;
		const qty = qtyCol >= 0 ? (parseFloat(row[qtyCol]) || 0) : 0;
		demand.push({ destination: dest, sku, name: sku, requiredQty: qty });
	}
	return demand;
}

export function parseArrivals(buf: ArrayBuffer, turnaround: number = 6): any[] {
	const wb = XLSX.read(buf, { type: 'array', cellDates: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
	let hr = 0;
	for (let i = 0; i < Math.min(10, rows.length); i++) {
		const r = rows[i].map(c => String(c).trim().toLowerCase());
		if (r.some(c => c.includes('planned delivery') || c.includes('arrival') || c.includes('nomenclature code'))) { hr = i; break; }
	}
	const headers = rows[hr].map(c => String(c).trim().toLowerCase());
	const gc = makeGC(headers);
	const arrCol = gc('planned delivery date', 'planned delivery', 'expected arrival date', 'arrival date', 'arrival');
	const skuCol = gc('nomenclature code', 'sku', 'code');
	const nameCol = gc('nomenclature name', 'name', 'description');
	const palletsCol = gc('pallets', 'expected pallet qty', 'pallet qty', 'pallet');
	const qtyCol = headers.findIndex(h => h === 'qty' || h === 'quantity');
	const contCol = gc('container', 'container number', 'container no', 'container #', 'cntr', 'booking', 'booking number');
	if (arrCol < 0 || skuCol < 0) throw new Error('Cannot find Planned Delivery Date and Nomenclature code columns.');
	const arrivals: any[] = [];
	for (let i = hr + 1; i < rows.length; i++) {
		const row = rows[i];
		const sku = String(row[skuCol] || '').trim();
		if (!sku || sku.toLowerCase() === 'total') continue;
		const arrDate = parseExcelDate(row[arrCol]);
		if (!arrDate || arrDate === '—') continue;
		const rawReady = addDays(arrDate, turnaround);
		const readyDate = nextWorkday(rawReady);
		const qty = qtyCol >= 0 ? (parseFloat(row[qtyCol]) || 0) : 0;
		arrivals.push({
			sku,
			name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
			arrivalDate: arrDate,
			readyDate,
			availPallets: palletsCol >= 0 ? (parseFloat(row[palletsCol]) || 0) : 0,
			container: contCol >= 0 ? String(row[contCol] || '').trim() : '',
			qty
		});
	}
	return arrivals;
}

/** Detect file type from content */
export function detectFileType(buf: ArrayBuffer): 'nomenclature' | 'materialplan' | 'arrivals' | 'unknown' {
	try {
		const wb = XLSX.read(buf, { type: 'array', cellDates: true });
		const ws = wb.Sheets[wb.SheetNames[0]];
		const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
		let hr = 0;
		for (let i = 0; i < Math.min(5, rows.length); i++) { if (rows[i].some((c: any) => String(c).trim())) { hr = i; break; } }
		const h = rows[hr].map((c: any) => String(c).trim().toLowerCase());
		const has = (s: string) => h.some(c => c.includes(s));
		if (has('pallet quantity') || has('pallet spaces') || has('units per pallet')) return 'nomenclature';
		if (has('planned delivery') || has('arrival date') || has('expected arrival')) return 'arrivals';
		if (has('venue cluster') || has('destination')) return 'materialplan';
		if (has('nomenclature code') && has('source')) return 'nomenclature';
		return 'unknown';
	} catch { return 'unknown'; }
}
