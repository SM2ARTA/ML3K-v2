/**
 * Database access layer — reads/writes from proper v2 tables.
 * Replaces migrate.ts once data migration is complete.
 */
import { supabase } from './supabase';

// ── LP Data ──

export async function getLPSettings() {
	const { data } = await supabase.from('lp_settings').select('*').single();
	return data;
}

export async function getLPNomenclature() {
	const { data } = await supabase.from('lp_nomenclature').select('*');
	return data || [];
}

export async function getLPDemand() {
	// Demand can have 24k+ rows — fetch all with pagination
	const all: any[] = [];
	let from = 0;
	const pageSize = 5000;
	while (true) {
		const { data } = await supabase.from('v_lp_demand').select('*').range(from, from + pageSize - 1);
		if (!data || data.length === 0) break;
		all.push(...data);
		if (data.length < pageSize) break;
		from += pageSize;
	}
	return all;
}

export async function getLPDemandRaw() {
	const { data } = await supabase.from('lp_demand').select('*');
	return data || [];
}

export async function getLPArrivals() {
	const { data } = await supabase.from('lp_arrivals').select('*').order('arrival_date');
	return data || [];
}

export async function getLPPlan() {
	const { data } = await supabase.from('lp_plan').select('*').order('truck_id');
	return data || [];
}

export async function getLPTruckSummary() {
	const { data } = await supabase.from('v_lp_truck_summary').select('*').order('truck_id');
	return data || [];
}

export async function getLPDestinations() {
	const { data } = await supabase.from('lp_destinations').select('*').order('abbr');
	return data || [];
}

export async function getLPCustomsOverrides() {
	const { data } = await supabase.from('lp_customs_overrides').select('*');
	return data || [];
}

export async function getLPHolds() {
	const { data } = await supabase.from('lp_holds').select('*');
	return data || [];
}

export async function getLPTruckDispatch() {
	const { data } = await supabase.from('lp_truck_dispatch').select('*');
	return data || [];
}

// ── LP Mutations ──

export async function updateCustomsOverride(sku: string, fields: Record<string, any>) {
	const { error } = await supabase
		.from('lp_customs_overrides')
		.upsert({ sku, ...fields }, { onConflict: 'sku' });
	return !error;
}

export async function toggleHSConfirm(sku: string, confirmed: boolean) {
	return updateCustomsOverride(sku, { hs_confirmed: confirmed });
}

export async function upsertHold(destination: string, sku: string, holdType = 'manual') {
	const { error } = await supabase
		.from('lp_holds')
		.upsert({ destination, sku, hold_type: holdType }, { onConflict: 'destination,sku,hold_type' });
	return !error;
}

export async function removeHold(destination: string, sku: string, holdType = 'manual') {
	const { error } = await supabase
		.from('lp_holds')
		.delete()
		.match({ destination, sku, hold_type: holdType });
	return !error;
}

export async function updateLPSettings(fields: Record<string, any>) {
	const { error } = await supabase.from('lp_settings').update(fields).eq('id', 1);
	return !error;
}

export async function updateDestination(abbr: string, fields: Record<string, any>) {
	const { error } = await supabase.from('lp_destinations').update(fields).eq('abbr', abbr);
	return !error;
}

// ── LM Data ──

export async function getLMNomenclature() {
	const { data } = await supabase.from('lm_nomenclature').select('*');
	return data || [];
}

export async function getLMDemand() {
	const { data } = await supabase.from('lm_demand').select('*');
	return data || [];
}

export async function getLMVenueSettings() {
	const { data } = await supabase.from('lm_venue_settings').select('*');
	return data || [];
}

// ── Stock ──

export async function getStockReport() {
	const { data } = await supabase.from('stock_report').select('*');
	return data || [];
}

// ── Real-time subscriptions ──

export function subscribeToTable(table: string, callback: (payload: any) => void) {
	return supabase
		.channel(`v2-${table}`)
		.on('postgres_changes', { event: '*', schema: 'public', table }, callback)
		.subscribe();
}

// ── Stats (for dashboard) ──

export async function getSystemStats() {
	const [nom, demand, plan, customs, holds, stock, lmNom, lmDemand, lmVenues] = await Promise.all([
		supabase.from('lp_nomenclature').select('sku', { count: 'exact', head: true }),
		supabase.from('lp_demand').select('id', { count: 'exact', head: true }),
		supabase.from('lp_plan').select('id', { count: 'exact', head: true }),
		supabase.from('lp_customs_overrides').select('sku', { count: 'exact', head: true }),
		supabase.from('lp_holds').select('id', { count: 'exact', head: true }),
		supabase.from('stock_report').select('sku', { count: 'exact', head: true }),
		supabase.from('lm_nomenclature').select('sku', { count: 'exact', head: true }),
		supabase.from('lm_demand').select('id', { count: 'exact', head: true }),
		supabase.from('lm_venue_settings').select('venue', { count: 'exact', head: true })
	]);

	return {
		lp: {
			skus: nom.count || 0,
			demandRows: demand.count || 0,
			planRows: plan.count || 0,
			customsOverrides: customs.count || 0,
			holds: holds.count || 0
		},
		lm: {
			skus: lmNom.count || 0,
			demandRows: lmDemand.count || 0,
			venues: lmVenues.count || 0
		},
		stock: { skus: stock.count || 0 }
	};
}
