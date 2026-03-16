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
	// Use server-side aggregation — returns ~658 SKU rows instead of 24k demand rows
	const { data, error } = await supabase.rpc('get_lp_demand_by_sku').limit(5000);
	if (error) {
		console.error('RPC get_lp_demand_by_sku failed:', error.message, error.code, error.details);
		// Fallback: paginate the view
		const all: any[] = [];
		let from = 0;
		while (true) {
			const { data: page } = await supabase.from('v_lp_demand').select('*').range(from, from + 999);
			if (!page || page.length === 0) break;
			all.push(...page);
			if (page.length < 1000) break;
			from += 1000;
		}
		console.log('Fallback loaded', all.length, 'rows from v_lp_demand');
		return all;
	}
	console.log('RPC returned', data?.length, 'aggregated SKU rows');
	return data || [];
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

// Container date overrides
export async function upsertContainerOverride(container: string, date: string) {
	const { error } = await supabase.from('lp_container_overrides').upsert({ container, override_date: date }, { onConflict: 'container' });
	return !error;
}

export async function removeContainerOverride(container: string) {
	await supabase.from('lp_container_overrides').delete().eq('container', container);
}

export async function getContainerOverrides() {
	const { data } = await supabase.from('lp_container_overrides').select('*');
	return data || [];
}

// Pallet overrides
export async function upsertPalletOverride(sku: string, palletQty: number, palletSpc: number) {
	const { error } = await supabase.from('lp_pallet_overrides').upsert({ sku, pallet_qty: palletQty, pallet_spc: palletSpc }, { onConflict: 'sku' });
	return !error;
}

export async function removePalletOverride(sku: string) {
	await supabase.from('lp_pallet_overrides').delete().eq('sku', sku);
}

export async function getPalletOverrides() {
	const { data } = await supabase.from('lp_pallet_overrides').select('*');
	return data || [];
}

// Manual arrivals
export async function addManualArrival(item: { sku: string; name: string; container: string; qty: number; arrival_date: string; ready_date: string; avail_pallets: number }) {
	const { error } = await supabase.from('lp_arrivals').insert({ ...item, is_manual: true });
	return !error;
}

export async function deleteArrival(id: number) {
	await supabase.from('lp_arrivals').delete().eq('id', id);
}

export async function updateTruckDispatch(truckId: number, fields: Record<string, any>) {
	const { error } = await supabase
		.from('lp_truck_dispatch')
		.upsert({ truck_id: truckId, ...fields }, { onConflict: 'truck_id' });
	return !error;
}

export async function saveLSR(truckId: number, lsr: string) {
	return updateTruckDispatch(truckId, { lsr_number: lsr || null });
}

/** Hold all SKUs from a source (optionally for a specific destination) */
export async function holdBySource(demandRows: any[], source: string, destination: string | null, release: boolean) {
	const pairs = demandRows
		.filter(d => d.source === source && (!destination || d.destination === destination))
		.map(d => ({ destination: d.destination, sku: d.sku }));

	if (release) {
		for (const p of pairs) {
			await supabase.from('lp_holds').delete().match({ destination: p.destination, sku: p.sku, hold_type: 'manual' });
		}
	} else {
		for (const p of pairs) {
			await supabase.from('lp_holds').upsert(
				{ destination: p.destination, sku: p.sku, hold_type: 'manual' },
				{ onConflict: 'destination,sku,hold_type' }
			);
		}
	}
	return true;
}

/** Get raw demand rows (for hold-by-source, need destination+sku+source) */
export async function getLPDemandForHolds() {
	const all: any[] = [];
	let from = 0;
	while (true) {
		const { data } = await supabase.from('lp_demand').select('sku, destination').range(from, from + 999);
		if (!data || data.length === 0) break;
		all.push(...data);
		if (data.length < 1000) break;
		from += 1000;
	}
	// Join with nomenclature for source
	const { data: noms } = await supabase.from('lp_nomenclature').select('sku, source');
	const srcMap = new Map((noms || []).map(n => [n.sku, n.source]));
	return all.map(d => ({ ...d, source: srcMap.get(d.sku) || '' }));
}

// ── LM Data ──

export async function getLMNomenclature() {
	const { data, error } = await supabase.from('lm_nomenclature').select('*');
	if (error) throw new Error('lm_nomenclature: ' + error.message);
	return data || [];
}

export async function getLMDemand() {
	// Paginate to handle >1000 rows (Supabase default limit)
	const all: any[] = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const { data, error } = await supabase.from('lm_demand').select('*').range(from, from + pageSize - 1);
		if (error) throw new Error('lm_demand: ' + error.message);
		if (!data || data.length === 0) break;
		all.push(...data);
		if (data.length < pageSize) break;
		from += pageSize;
	}
	return all;
}

export async function getLMVenueSettings() {
	const { data, error } = await supabase.from('lm_venue_settings').select('*');
	if (error) throw new Error('lm_venue_settings: ' + error.message);
	return data || [];
}

export async function updateLMVenueSettings(venue: string, fields: Record<string, any>) {
	const { error } = await supabase.from('lm_venue_settings').upsert({ venue, ...fields }, { onConflict: 'venue' });
	return !error;
}

export async function getLMPalletConfig() {
	const { data } = await supabase.from('lm_pallet_config').select('*');
	return data || [];
}

export async function getLMDispatch() {
	const { data } = await supabase.from('lm_dispatch').select('*');
	return data || [];
}

export async function updateLMDispatch(fingerprint: string, dispatched: boolean, dateOverride?: string) {
	const fields: Record<string, any> = { fingerprint, dispatched };
	if (dateOverride) fields.date_override = dateOverride;
	const { error } = await supabase.from('lm_dispatch').upsert(fields, { onConflict: 'fingerprint' });
	return !error;
}

// ── LM Excluded ──

export async function getLMExcluded() {
	const { data } = await supabase.from('lm_excluded').select('*');
	return data || [];
}

export async function addLMExcluded(itemId: string, isUserOverride = false) {
	const { error } = await supabase.from('lm_excluded').upsert({ item_id: itemId, is_user_override: isUserOverride }, { onConflict: 'item_id' });
	return !error;
}

export async function removeLMExcluded(itemId: string) {
	const { error } = await supabase.from('lm_excluded').delete().eq('item_id', itemId);
	return !error;
}

// ── LM Manual Items ──

export async function getLMManualItems() {
	const { data } = await supabase.from('lm_manual_items').select('*');
	return data || [];
}

export async function addLMManualItem(item: { truck_key: string; sku: string; name?: string; qty?: number; pallets?: number; hs_code?: string; country?: string; unit_price?: number }) {
	const { error } = await supabase.from('lm_manual_items').insert(item);
	return !error;
}

export async function removeLMManualItem(id: number) {
	const { error } = await supabase.from('lm_manual_items').delete().eq('id', id);
	return !error;
}

// ── LM Demand Adjustments ──

export async function getLMDemandAdj() {
	const { data } = await supabase.from('lm_demand_adj').select('*');
	return data || [];
}

export async function upsertLMDemandAdj(venueSku: string, qty: number) {
	const { error } = await supabase.from('lm_demand_adj').upsert({ venue_sku: venueSku, adjusted_qty: qty }, { onConflict: 'venue_sku' });
	return !error;
}

export async function removeLMDemandAdj(venueSku: string) {
	const { error } = await supabase.from('lm_demand_adj').delete().eq('venue_sku', venueSku);
	return !error;
}

// ── LM Nom Overrides ──

export async function getLMNomOverrides() {
	const { data } = await supabase.from('lm_nom_overrides').select('*');
	return data || [];
}

export async function upsertLMNomOverride(sku: string, fields: { pallet_qty?: number; pallet_spc?: number; pallet_qty_asm?: number; pallet_spc_asm?: number }) {
	const { error } = await supabase.from('lm_nom_overrides').upsert({ sku, ...fields }, { onConflict: 'sku' });
	return !error;
}

export async function removeLMNomOverride(sku: string) {
	const { error } = await supabase.from('lm_nom_overrides').delete().eq('sku', sku);
	return !error;
}

// ── LM Manual Demand ──

export async function getLMManualDemand() {
	const { data } = await supabase.from('lm_manual_demand').select('*');
	return data || [];
}

export async function addLMManualDemand(item: { sku: string; name?: string; source?: string; venue: string; qty?: number; bump_in_date?: string; cluster?: string; venue_code?: string; venue_type?: string; uom?: string; pcs_per_unit?: number; pallet_qty?: number; pallet_spc?: number; pallet_qty_asm?: number; pallet_spc_asm?: number }) {
	const { error } = await supabase.from('lm_manual_demand').insert(item);
	return !error;
}

export async function removeLMManualDemand(id: number) {
	const { error } = await supabase.from('lm_manual_demand').delete().eq('id', id);
	return !error;
}

// ── LM Kits ──

export async function getLMKits() {
	const { data: kits } = await supabase.from('lm_kits').select('*');
	if (!kits || kits.length === 0) return [];
	const { data: items } = await supabase.from('lm_kit_items').select('*');
	const itemsByKit = new Map<number, { sku: string; qty: number }[]>();
	for (const item of items || []) {
		if (!itemsByKit.has(item.kit_id)) itemsByKit.set(item.kit_id, []);
		itemsByKit.get(item.kit_id)!.push({ sku: item.sku, qty: item.qty });
	}
	return kits.map(k => ({
		id: k.id,
		sku: k.sku,
		name: k.name,
		venue: k.venue,
		pallet_qty: k.pallet_qty,
		pallet_spc: k.pallet_spc,
		items: itemsByKit.get(k.id) || []
	}));
}

export async function addLMKit(kit: { id: number; sku: string; name?: string; venue: string; pallet_qty?: number; pallet_spc?: number }, items: { sku: string; qty: number }[]) {
	const { error: kitErr } = await supabase.from('lm_kits').insert(kit);
	if (kitErr) return false;
	if (items.length > 0) {
		const rows = items.map(i => ({ kit_id: kit.id, sku: i.sku, qty: i.qty }));
		const { error: itemErr } = await supabase.from('lm_kit_items').insert(rows);
		if (itemErr) return false;
	}
	return true;
}

export async function removeLMKit(id: number) {
	// CASCADE on lm_kit_items handles child deletion
	const { error } = await supabase.from('lm_kits').delete().eq('id', id);
	return !error;
}

// ── LM STP Deliveries ──

export async function getLMStpDeliveries() {
	const { data } = await supabase.from('lm_stp_deliveries').select('*');
	return data || [];
}

export async function upsertLMStpDelivery(fields: { id: number; venue: string; delivery_date?: string; rate?: number }) {
	const { error } = await supabase.from('lm_stp_deliveries').upsert(fields, { onConflict: 'id' });
	return !error;
}

export async function removeLMStpDelivery(id: number) {
	const { error } = await supabase.from('lm_stp_deliveries').delete().eq('id', id);
	return !error;
}

// ── LM Distribution Rate Overrides ──

export async function getLMDistOverrides() {
	const { data } = await supabase.from('lm_dist_overrides').select('*');
	return data || [];
}

export async function upsertLMDistOverride(routeKey: string, rate: number) {
	const { error } = await supabase.from('lm_dist_overrides').upsert({ route_key: routeKey, rate }, { onConflict: 'route_key' });
	return !error;
}

export async function removeLMDistOverride(routeKey: string) {
	const { error } = await supabase.from('lm_dist_overrides').delete().eq('route_key', routeKey);
	return !error;
}

// ── LM Pallet Config ──

export async function updateLMPalletConfig(venueType: string, mode: string, overrideSkus: string[]) {
	const { error } = await supabase.from('lm_pallet_config').upsert({ venue_type: venueType, mode, override_skus: overrideSkus }, { onConflict: 'venue_type' });
	return !error;
}

// ── App Settings ──

export async function getAppSettings() {
	const { data } = await supabase.from('app_settings').select('*');
	return data || [];
}

export async function getAppSetting(key: string) {
	const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
	return data?.value ?? null;
}

export async function updateAppSetting(key: string, value: any) {
	const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
	return !error;
}

// ── Stock ──

export async function getStockReport() {
	const { data } = await supabase.from('stock_report').select('*');
	return data || [];
}

export async function getStockQtyMap(): Promise<Record<string, number>> {
	const { data } = await supabase.from('stock_report').select('sku, qty');
	const map: Record<string, number> = {};
	for (const row of data || []) {
		if (row.sku && row.qty != null) map[row.sku] = Number(row.qty);
	}
	return map;
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
