/**
 * Backup/Restore — exports all v2 data to Excel, imports from Excel
 * Simplified v2 version using proper table reads
 */
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

async function fetchAll(table: string) {
	const all: any[] = [];
	let from = 0;
	while (true) {
		const { data } = await supabase.from(table).select('*').range(from, from + 999);
		if (!data || data.length === 0) break;
		all.push(...data);
		if (data.length < 1000) break;
		from += 1000;
	}
	return all;
}

/** Export all data to Excel backup file */
export async function exportBackup() {
	const wb = XLSX.utils.book_new();
	const now = new Date().toISOString().slice(0, 10);

	// LP tables
	const tables = [
		'lp_nomenclature', 'lp_demand', 'lp_arrivals', 'lp_plan',
		'lp_truck_dispatch', 'lp_customs_overrides', 'lp_holds',
		'lp_pallet_overrides', 'lp_container_overrides',
		'lp_settings', 'lp_destinations',
		'lm_nomenclature', 'lm_demand', 'lm_venue_settings',
		'lm_dispatch', 'lm_excluded', 'lm_manual_items',
		'lm_demand_adj', 'lm_nom_overrides', 'lm_manual_demand',
		'lm_kits', 'lm_kit_items', 'lm_stp_deliveries',
		'lm_dist_overrides', 'lm_pallet_config',
		'stock_report', 'app_settings'
	];

	for (const table of tables) {
		try {
			const data = await fetchAll(table);
			if (data.length > 0) {
				const ws = XLSX.utils.json_to_sheet(data);
				const sheetName = table.replace(/_/g, ' ').slice(0, 31); // Excel 31 char limit
				XLSX.utils.book_append_sheet(wb, ws, sheetName);
			}
		} catch (e) {
			console.warn(`Backup: skipped ${table}:`, e);
		}
	}

	XLSX.writeFile(wb, `ML3K-Backup-${now}.xlsx`);
}

/** Import backup from Excel file */
export async function importBackup(buf: ArrayBuffer): Promise<string[]> {
	const wb = XLSX.read(buf, { type: 'array' });
	const log: string[] = [];

	const tableMap: Record<string, string> = {
		'lp nomenclature': 'lp_nomenclature',
		'lp demand': 'lp_demand',
		'lp arrivals': 'lp_arrivals',
		'lp plan': 'lp_plan',
		'lp truck dispatch': 'lp_truck_dispatch',
		'lp customs overrides': 'lp_customs_overrides',
		'lp holds': 'lp_holds',
		'lp pallet overrides': 'lp_pallet_overrides',
		'lp settings': 'lp_settings',
		'lp destinations': 'lp_destinations',
		'lp container overrides': 'lp_container_overrides',
		'lm nomenclature': 'lm_nomenclature',
		'lm demand': 'lm_demand',
		'lm venue settings': 'lm_venue_settings',
		'lm dispatch': 'lm_dispatch',
		'lm excluded': 'lm_excluded',
		'lm manual items': 'lm_manual_items',
		'lm demand adj': 'lm_demand_adj',
		'lm nom overrides': 'lm_nom_overrides',
		'lm manual demand': 'lm_manual_demand',
		'lm kits': 'lm_kits',
		'lm kit items': 'lm_kit_items',
		'lm stp deliveries': 'lm_stp_deliveries',
		'lm dist overrides': 'lm_dist_overrides',
		'lm pallet config': 'lm_pallet_config',
		'stock report': 'stock_report',
		'app settings': 'app_settings',
	};

	for (const sheetName of wb.SheetNames) {
		const tableName = tableMap[sheetName.toLowerCase()];
		if (!tableName) { log.push(`⚠ Skipped unknown sheet: ${sheetName}`); continue; }

		const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
		if (!rows.length) { log.push(`⚠ Empty sheet: ${sheetName}`); continue; }

		try {
			// Clear existing data (except settings which are upserted)
			if (!tableName.includes('settings') && !tableName.includes('destinations')) {
				await supabase.from(tableName).delete().neq('id' in rows[0] ? 'id' : 'sku', '___never___');
			}

			// Insert in batches
			for (let i = 0; i < rows.length; i += 500) {
				const batch = rows.slice(i, i + 500);
				// Remove auto-generated fields
				batch.forEach(r => { delete r.created_at; delete r.updated_at; });
				const { error } = await supabase.from(tableName).upsert(batch);
				if (error) throw error;
			}
			log.push(`✅ ${sheetName}: ${rows.length} rows`);
		} catch (e: any) {
			log.push(`❌ ${sheetName}: ${e.message}`);
		}
	}

	return log;
}
