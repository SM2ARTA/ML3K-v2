/**
 * LM Excel file parsers — nomenclature and material plan
 */
import * as XLSX from 'xlsx';
import { makeGC, parseExcelDate } from './lp-helpers';

export function parseLMNomenclature(buf: ArrayBuffer): Record<string, any> {
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
	const uomCol = gc('uom', 'unit of measure');
	const ppuCol = gc('pcs per unit', 'pcs/unit', 'pieces per unit');
	const pqCol = gc('pallet quantity, disassembled', 'pallet quantity', 'pallet qty', 'units per pallet');
	const psCol = gc('pallet spaces, disassembled', 'pallet spaces', 'spaces');
	const pqaCol = gc('pallet quantity, assembled', 'assembled qty');
	const psaCol = gc('pallet spaces, assembled', 'assembled spaces');
	if (skuCol < 0) throw new Error('Cannot find Nomenclature code column.');
	const nomen: Record<string, any> = {};
	for (let i = hr + 1; i < rows.length; i++) {
		const row = rows[i];
		const sku = String(row[skuCol] || '').trim();
		if (!sku) continue;
		nomen[sku] = {
			name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
			source: sourceCol >= 0 ? String(row[sourceCol] || '').trim() : '',
			uom: uomCol >= 0 ? String(row[uomCol] || '').trim() : 'pc',
			pcsPerUnit: ppuCol >= 0 ? (parseInt(row[ppuCol]) || 1) : 1,
			palletQty: pqCol >= 0 ? (parseFloat(row[pqCol]) || 0) : 0,
			palletSpc: psCol >= 0 ? (parseFloat(row[psCol]) || 0) : 0,
			palletQtyAsm: pqaCol >= 0 ? (parseFloat(row[pqaCol]) || 0) : 0,
			palletSpcAsm: psaCol >= 0 ? (parseFloat(row[psaCol]) || 0) : 0,
		};
	}
	return nomen;
}

export function parseLMMaterialPlan(buf: ArrayBuffer): any[] {
	const wb = XLSX.read(buf, { type: 'array', cellDates: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
	let hr = 0;
	for (let i = 0; i < Math.min(10, rows.length); i++) {
		const r = rows[i].map(c => String(c).trim().toLowerCase());
		if (r.some(c => c.includes('venue') || c.includes('nomenclature') || c.includes('required'))) { hr = i; break; }
	}
	const headers = rows[hr].map(c => String(c).trim().toLowerCase());
	const gc = makeGC(headers);
	const venueCol = gc('venue', 'venue name');
	const venueCodeCol = gc('venue code');
	const venueTypeCol = gc('venue type');
	const clusterCol = gc('venue cluster', 'cluster');
	const skuCol = gc('nomenclature', 'nomenclature code', 'sku', 'code');
	const qtyCol = gc('required', 'qty', 'quantity');
	const biCol = gc('estimated bump-in date', 'bump-in date', 'bump in date', 'delivery date');
	if (venueCol < 0 || skuCol < 0) throw new Error('Cannot find Venue and Nomenclature columns.');
	const data: any[] = [];
	for (let i = hr + 1; i < rows.length; i++) {
		const row = rows[i];
		const venue = String(row[venueCol] || '').trim();
		const sku = String(row[skuCol] || '').trim();
		if (!venue || !sku) continue;
		data.push({
			venue,
			venueCode: venueCodeCol >= 0 ? String(row[venueCodeCol] || '').trim() : '',
			venueType: venueTypeCol >= 0 ? String(row[venueTypeCol] || '').trim() : '',
			cluster: clusterCol >= 0 ? String(row[clusterCol] || '').trim() : '',
			sku,
			requiredQty: qtyCol >= 0 ? (parseInt(row[qtyCol]) || 0) : 0,
			bumpInDate: biCol >= 0 ? parseExcelDate(row[biCol]) : null
		});
	}
	return data;
}
