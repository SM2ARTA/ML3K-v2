/**
 * Migration utility — reads data from shared_state JSON blobs
 * and provides it in a structured format for the new app.
 *
 * This is a read-only bridge: the v1 app continues to write to shared_state,
 * and this module reads from it. Once migration is complete and v2 has its own
 * tables, this file can be removed.
 */
import { supabase } from './supabase';

interface SharedStateRow {
	id: string;
	value: string;
}

async function getKey(id: string): Promise<any> {
	const { data, error } = await supabase
		.from('shared_state')
		.select('value')
		.eq('id', id)
		.single();
	if (error || !data?.value) return null;
	try { return JSON.parse(data.value); } catch { return null; }
}

/** Load all LP data from shared_state (same keys as v1) */
export async function loadLPFromSharedState() {
	const [config, nom, demand, arrivals, plan, truck] = await Promise.all([
		getKey('lp-config'),
		getKey('lp-nom'),
		getKey('lp-demand'),
		getKey('lp-arrivals'),
		getKey('lp-plan'),
		getKey('lp-truck-state')
	]);

	return {
		config: config || {},
		nomenclature: nom || {},
		materialPlan: demand || [],
		arrivals: arrivals || [],
		generatedPlan: plan || [],
		truckState: truck || {}
	};
}

/** Load all LM data from shared_state */
export async function loadLMFromSharedState() {
	const [nom, rw, vs, stock, dispatch, manualItems, demandAdj, nomOvr, clusterTA, manualDemand, kits, stp, distOvr, palletCfg] = await Promise.all([
		getKey('fm-nom'),
		getKey('fm-rw'),
		getKey('fm-vs'),
		getKey('fm-stock'),
		getKey('fm-lm-dispatch'),
		getKey('fm-manual-items'),
		getKey('fm-lm-demand-adj'),
		getKey('fm-lm-nom-ovr'),
		getKey('fm-cluster-ta'),
		getKey('fm-lm-manual-demand'),
		getKey('fm-lm-kits'),
		getKey('fm-lm-stp-deliveries'),
		getKey('fm-dist-overrides'),
		getKey('fm-pallet-cfg')
	]);

	return {
		nomenclature: nom || {},
		rawData: rw || [],
		venueSettings: vs || {},
		stock: stock || {},
		dispatch: dispatch || {},
		manualItems: manualItems || [],
		demandAdj: demandAdj || [],
		nomOverrides: nomOvr || {},
		clusterTurnaround: clusterTA || 5,
		manualDemand: manualDemand || [],
		kits: kits || [],
		stpDeliveries: stp || [],
		distOverrides: distOvr || {},
		palletConfig: palletCfg || {}
	};
}

/** Load AI config */
export async function loadAIConfig() {
	const cfg = await getKey('hs-ai-config');
	return cfg || null;
}
