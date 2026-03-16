<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseLMNomenclature, parseLMMaterialPlan } from '$lib/lm-parsers';
	import { supabase } from '$lib/supabase';
	import { Spinner } from '$lib/components';

	let files = $state<{ name: string; type: string; buf: ArrayBuffer }[]>([]);
	let status = $state('');
	let error = $state('');
	let processing = $state(false);

	async function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		for (const f of Array.from(input.files)) {
			if (!f.name.match(/\.xlsx?$/i)) continue;
			const buf = await f.arrayBuffer();
			// Detect type
			const type = detectType(buf);
			files = [...files, { name: f.name, type, buf }];
		}
	}

	function detectType(buf: ArrayBuffer): string {
		try {
			const XLSX = (window as any).XLSX || null;
			// Simple heuristic based on file name or content
			return 'unknown';
		} catch { return 'unknown'; }
	}

	async function upload() {
		if (files.length < 2) { error = 'Upload both Nomenclature and Material Plan files'; return; }
		processing = true; error = '';

		try {
			// Try each file as nom and plan
			let nomData: Record<string, any> | null = null;
			let planData: any[] | null = null;

			for (const f of files) {
				try {
					const nom = parseLMNomenclature(f.buf);
					if (Object.keys(nom).length > 10) { nomData = nom; status = `Nomenclature: ${Object.keys(nom).length} SKUs`; continue; }
				} catch {}
				try {
					const plan = parseLMMaterialPlan(f.buf);
					if (plan.length > 10) { planData = plan; status = `Material Plan: ${plan.length} rows`; continue; }
				} catch {}
			}

			if (!nomData) throw new Error('Could not parse nomenclature file');
			if (!planData) throw new Error('Could not parse material plan file');

			// Save nomenclature
			status = 'Saving nomenclature...';
			const nomRows = Object.entries(nomData).map(([sku, n]: [string, any]) => ({
				sku, name: n.name, source: n.source, uom: n.uom || 'pc', pcs_per_unit: n.pcsPerUnit || 1,
				pallet_qty: n.palletQty, pallet_spc: n.palletSpc, pallet_qty_asm: n.palletQtyAsm || 0, pallet_spc_asm: n.palletSpcAsm || 0
			}));
			for (let i = 0; i < nomRows.length; i += 500) {
				await supabase.from('lm_nomenclature').upsert(nomRows.slice(i, i + 500), { onConflict: 'sku' });
			}

			// Save demand
			status = 'Saving demand...';
			await supabase.from('lm_demand').delete().eq('is_manual', false);
			const demandRows = planData.map(d => ({
				venue: d.venue, venue_code: d.venueCode, venue_type: d.venueType, venue_cluster: d.cluster,
				sku: d.sku, required_qty: d.requiredQty, bump_in_date: d.bumpInDate
			}));
			for (let i = 0; i < demandRows.length; i += 500) {
				await supabase.from('lm_demand').insert(demandRows.slice(i, i + 500));
			}

			status = `Done! ${Object.keys(nomData).length} SKUs, ${planData.length} demand rows`;
			processing = false;
			setTimeout(() => goto('/lm'), 1500);
		} catch (e: any) {
			error = e.message;
			processing = false;
		}
	}
</script>

<div style="max-width:520px;margin:40px auto;padding:20px">
	<h2 style="font-size:18px;font-weight:700;margin-bottom:4px">🚛 Last Mile Upload</h2>
	<p style="font-size:12px;color:var(--ts);margin-bottom:16px">Upload Nomenclature and Material Plan files</p>

	<label ondrop={(e) => { e.preventDefault(); }} ondragover={(e) => e.preventDefault()}
		style="display:block;padding:24px;text-align:center;border:2px dashed var(--bd);border-radius:10px;cursor:pointer;margin-bottom:12px">
		<div style="font-size:28px;margin-bottom:6px">📂</div>
		<div style="font-weight:600;font-size:13px">Select .xlsx files</div>
		<input type="file" accept=".xlsx,.xls" multiple onchange={handleInput} style="position:absolute;width:1px;height:1px;opacity:0">
	</label>

	{#each files as f, i}
		<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;margin-bottom:4px;background:var(--sf)">
			<span style="font-size:11px;flex:1">{f.name}</span>
			<button onclick={() => files = files.filter((_, j) => j !== i)} style="background:none;border:none;cursor:pointer;color:var(--rd)">✕</button>
		</div>
	{/each}

	{#if processing}
		<Spinner message={status} size={24} />
	{:else}
		<button class="mbtn mbtn-primary" onclick={upload} style="width:100%;margin-top:12px;opacity:{files.length >= 2 ? 1 : 0.5}" disabled={files.length < 2}>
			Upload & Save
		</button>
	{/if}

	{#if error}<div style="margin-top:8px;padding:8px;background:var(--rs);color:var(--rd);border-radius:6px;font-size:11px">{error}</div>{/if}
	{#if status && !processing}<div style="margin-top:8px;padding:8px;background:var(--gs);color:var(--gn);border-radius:6px;font-size:11px">{status}</div>{/if}
</div>
