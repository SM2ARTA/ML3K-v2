/**
 * Reset functions — clear Supabase tables and reload app
 * Ported from v1: doSystemReset, doResetLP, doSoftResetLP, doResetLM, doSoftResetLM
 */
import { supabase } from './supabase';

/** Delete all rows from a table using a universal column trick */
async function clearTable(table: string, pk = 'id') {
	// Use neq with impossible value to match all rows
	await supabase.from(table).delete().neq(pk, '___never___');
}

/** Delete all rows from multiple tables */
async function clearTables(tables: { table: string; pk?: string }[]) {
	await Promise.all(tables.map(t => clearTable(t.table, t.pk)));
}

// ── Table Lists ──

const LP_TABLES = [
	{ table: 'lp_nomenclature', pk: 'sku' },
	{ table: 'lp_demand' },
	{ table: 'lp_arrivals' },
	{ table: 'lp_plan' },
	{ table: 'lp_truck_dispatch', pk: 'truck_id' },
	{ table: 'lp_customs_overrides', pk: 'sku' },
	{ table: 'lp_holds' },
	{ table: 'lp_pallet_overrides', pk: 'sku' },
	{ table: 'lp_container_overrides', pk: 'container' },
	{ table: 'lp_arrived_containers', pk: 'container_key' },
];

const LP_SETTINGS_TABLES = [
	{ table: 'lp_settings' }, // single row, reset to defaults
	{ table: 'lp_destinations', pk: 'abbr' }, // will re-insert defaults
];

const LM_TABLES = [
	{ table: 'lm_nomenclature', pk: 'sku' },
	{ table: 'lm_demand' },
	{ table: 'lm_venue_settings', pk: 'venue' },
	{ table: 'lm_dispatch', pk: 'fingerprint' },
	{ table: 'lm_excluded', pk: 'item_id' },
	{ table: 'lm_manual_items' },
	{ table: 'lm_demand_adj', pk: 'venue_sku' },
	{ table: 'lm_nom_overrides', pk: 'sku' },
	{ table: 'lm_manual_demand' },
	{ table: 'lm_kits', pk: 'id' },
	{ table: 'lm_kit_items' },
	{ table: 'lm_stp_deliveries', pk: 'id' },
	{ table: 'lm_dist_overrides', pk: 'route_key' },
	{ table: 'lm_pallet_config', pk: 'venue_type' },
];

const SHARED_TABLES = [
	{ table: 'stock_report', pk: 'sku' },
	{ table: 'app_settings', pk: 'key' },
];

// ── Reset Functions ──

/** System Reset — clears EVERYTHING, all modules, all data */
export async function doSystemReset(): Promise<void> {
	await clearTables([...LP_TABLES, ...LP_SETTINGS_TABLES, ...LM_TABLES, ...SHARED_TABLES]);
	// Clear hs-ai-config from app_settings
	await supabase.from('app_settings').delete().eq('key', 'ai_config');
	// Re-insert LP defaults
	await resetLPDefaults();
}

/** LP Hard Reset — clears all LP data + settings */
export async function doResetLP(): Promise<void> {
	await clearTables([...LP_TABLES]);
	// Reset settings to defaults
	await supabase.from('lp_settings').upsert({
		id: 1, turnaround: 6, max_pallets: 26, max_trucks: 4, max_dests: 3,
		ric_start_date: '2026-04-01', plan_generated: false, exclude_staples: true
	});
}

/** LP Soft Reset — clears files/plan but keeps truck-state (dispatch, customs, overrides) */
export async function doSoftResetLP(): Promise<void> {
	// Clear file data and plan
	await clearTables([
		{ table: 'lp_nomenclature', pk: 'sku' },
		{ table: 'lp_demand' },
		{ table: 'lp_plan' },
	]);
	// Clear non-manual arrivals only, keep manual arrivals
	await supabase.from('lp_arrivals').delete().eq('is_manual', false);
	// Mark plan as not generated
	await supabase.from('lp_settings').update({ plan_generated: false }).eq('id', 1);
	// Preserved: lp_truck_dispatch, lp_customs_overrides, lp_holds,
	// lp_pallet_overrides, lp_container_overrides, lp_arrived_containers, lp_destinations
}

/** LM Hard Reset — clears all LM data */
export async function doResetLM(): Promise<void> {
	await clearTables(LM_TABLES);
}

/** LM Soft Reset — clears nom + demand only, keeps all overrides/settings */
export async function doSoftResetLM(): Promise<void> {
	// Clear only file-level data
	await clearTables([
		{ table: 'lm_nomenclature', pk: 'sku' },
		{ table: 'lm_demand' },
	]);
	// Preserved: lm_venue_settings, lm_dispatch, lm_excluded, lm_manual_items,
	// lm_demand_adj, lm_nom_overrides, lm_manual_demand, lm_kits, lm_kit_items,
	// lm_stp_deliveries, lm_dist_overrides, lm_pallet_config
}

/** Re-insert LP destination defaults */
async function resetLPDefaults() {
	await supabase.from('lp_settings').upsert({
		id: 1, turnaround: 6, max_pallets: 26, max_trucks: 4, max_dests: 3,
		ric_start_date: '2026-04-01', plan_generated: false, exclude_staples: true
	});
	const dests = [
		{ abbr: 'TOR', name: 'Toronto', country: 'CAN', transit_days: 7, whs_days: 3 },
		{ abbr: 'VAN', name: 'Vancouver', country: 'CAN', transit_days: 7, whs_days: 3 },
		{ abbr: 'CDMX', name: 'Mexico City', country: 'MEX', transit_days: 7, whs_days: 3 },
		{ abbr: 'GDL', name: 'Guadalajara', country: 'MEX', transit_days: 7, whs_days: 3 },
		{ abbr: 'MTY', name: 'Monterrey', country: 'MEX', transit_days: 7, whs_days: 3 },
		{ abbr: 'KC', name: 'Kansas City', country: 'USA', transit_days: 1, whs_days: 3 },
		{ abbr: 'HOU', name: 'Houston', country: 'USA', transit_days: 1, whs_days: 3 },
		{ abbr: 'NY', name: 'New York', country: 'USA', transit_days: 3, whs_days: 3 },
	];
	await supabase.from('lp_destinations').upsert(dests, { onConflict: 'abbr' });
}
