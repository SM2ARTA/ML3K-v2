<script lang="ts">
	import Modal from './Modal.svelte';
	import { exportCI } from '$lib/exports';
	import { matchTransitAbbr } from '$lib/lp-helpers';

	const CCI_DESTS = [
		{ abbr: 'TOR', label: '🇨🇦 Toronto' }, { abbr: 'VAN', label: '🇨🇦 Vancouver' },
		{ abbr: 'GDL', label: '🇲🇽 Guadalajara' }, { abbr: 'CDMX', label: '🇲🇽 Mexico City' },
		{ abbr: 'MTY', label: '🇲🇽 Monterrey' }, { abbr: 'NY', label: '🇺🇸 New York / NJ' },
		{ abbr: 'KC', label: '🇺🇸 Kansas City' }, { abbr: 'HOU', label: '🇺🇸 Houston' }
	];

	let { open = $bindable(false), demandData, nomenclature = {}, customsOverrides = {} }: {
		open: boolean; demandData: any[]; nomenclature?: Record<string, any>; customsOverrides?: Record<string, any>;
	} = $props();

	let selectedDests = $state(new Set(CCI_DESTS.map(d => d.abbr)));
	let allSources = $derived([...new Set(demandData.map(d => d.source).filter(Boolean))].sort());
	let selectedSources = $state(new Set<string>());
	let allSrcSelected = $state(true);

	// Filter sources based on selected destinations
	let filteredSources = $derived.by(() => {
		const destsSet = selectedDests;
		const sources = new Set<string>();
		for (const d of demandData) {
			const abbr = matchTransitAbbr(Object.keys(d.dests || {})[0] || '');
			if (abbr && destsSet.has(abbr)) sources.add(d.source);
		}
		return [...sources].filter(Boolean).sort();
	});

	// Aggregate items
	let aggregatedItems = $derived.by(() => {
		const map = new Map<string, { sku: string; name: string; qty: number; pallets: number }>();
		for (const d of demandData) {
			if (!allSrcSelected && !selectedSources.has(d.source)) continue;
			for (const [dest, qty] of Object.entries(d.dests || {})) {
				const abbr = matchTransitAbbr(dest);
				if (!abbr || !selectedDests.has(abbr)) continue;
				if (!map.has(d.sku)) map.set(d.sku, { sku: d.sku, name: d.name || '', qty: 0, pallets: 0 });
				const item = map.get(d.sku)!;
				item.qty += qty as number;
				if (d.pallet_qty > 0) item.pallets += ((qty as number) / d.pallet_qty) * (d.pallet_spc || 0);
			}
		}
		return [...map.values()].sort((a, b) => b.qty - a.qty);
	});

	let totalQty = $derived(aggregatedItems.reduce((s, i) => s + i.qty, 0));
	let totalPlt = $derived(aggregatedItems.reduce((s, i) => s + i.pallets, 0));

	function getParty() {
		const mex = new Set(['GDL', 'CDMX', 'MTY']);
		const can = new Set(['TOR', 'VAN']);
		const allMex = [...selectedDests].every(d => mex.has(d));
		const allCan = [...selectedDests].every(d => can.has(d));
		if (allMex) return 'Mexico';
		if (allCan) return 'Canada';
		return '';
	}

	function doExport() {
		// Build pseudo plan rows for the CI export
		const destLabel = [...selectedDests].map(a => CCI_DESTS.find(d => d.abbr === a)?.label || a).join(', ');
		const pseudoPlan = aggregatedItems.map(item => ({
			truck_id: 0, dispatch_date: new Date().toISOString().slice(0, 10),
			destination: destLabel, sku: item.sku, name: item.name, qty: item.qty, pallets: item.pallets
		}));
		exportCI(0, pseudoPlan, nomenclature, customsOverrides);
		open = false;
	}

	function toggleDest(abbr: string) {
		const next = new Set(selectedDests);
		if (next.has(abbr)) next.delete(abbr); else next.add(abbr);
		selectedDests = next;
	}
</script>

<Modal title="📄 Combined CI Export" subtitle="Multi-destination Commercial Invoice" bind:open maxWidth="600px">
	<!-- Destination selection -->
	<div style="margin-bottom:12px">
		<div style="font-size:11px;font-weight:600;color:var(--ts);margin-bottom:6px">Select Destinations:</div>
		<div style="display:flex;flex-wrap:wrap;gap:4px">
			{#each CCI_DESTS as d}
				<label style="display:flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid {selectedDests.has(d.abbr) ? 'var(--ac)' : 'var(--bd)'};border-radius:5px;font-size:10px;cursor:pointer;background:{selectedDests.has(d.abbr) ? 'var(--as)' : 'var(--sf)'}">
					<input type="checkbox" checked={selectedDests.has(d.abbr)} onchange={() => toggleDest(d.abbr)}>
					{d.label}
				</label>
			{/each}
		</div>
		<div style="display:flex;gap:4px;margin-top:4px">
			<button onclick={() => selectedDests = new Set(CCI_DESTS.map(d => d.abbr))} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--gs);color:var(--gn);cursor:pointer">All</button>
			<button onclick={() => selectedDests = new Set()} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--rs);color:var(--rd);cursor:pointer">None</button>
		</div>
	</div>

	<!-- Source filter -->
	<div style="margin-bottom:12px">
		<div style="font-size:11px;font-weight:600;color:var(--ts);margin-bottom:6px">Sources:</div>
		<div style="display:flex;flex-wrap:wrap;gap:4px">
			<label style="display:flex;align-items:center;gap:4px;padding:3px 6px;font-size:10px;cursor:pointer">
				<input type="checkbox" checked={allSrcSelected} onchange={() => { allSrcSelected = !allSrcSelected; if (allSrcSelected) selectedSources = new Set(); }}>
				All Sources
			</label>
			{#if !allSrcSelected}
				{#each filteredSources as src}
					<label style="display:flex;align-items:center;gap:4px;padding:3px 6px;font-size:10px;cursor:pointer">
						<input type="checkbox" checked={selectedSources.has(src)} onchange={() => { const n = new Set(selectedSources); if (n.has(src)) n.delete(src); else n.add(src); selectedSources = n; }}>
						{src}
					</label>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Summary -->
	<div style="background:var(--bg);padding:10px;border-radius:6px;margin-bottom:12px;font-size:11px">
		<b>{aggregatedItems.length}</b> SKUs · <b>{totalQty.toLocaleString()}</b> pcs · <b>{totalPlt.toFixed(1)}</b> pallets
		{#if getParty()}<span style="color:var(--pu);margin-left:8px">Party: {getParty()}</span>{/if}
	</div>

	<!-- Export -->
	<button class="mbtn mbtn-primary" onclick={doExport} style="width:100%;background:var(--pu);border-color:var(--pu)"
		disabled={aggregatedItems.length === 0}>
		📄 Export Combined CI ({aggregatedItems.length} SKUs)
	</button>
</Modal>
