<script lang="ts">
	import { parseNomenclature, parseMaterialPlan, parseArrivals, detectFileType } from '$lib/lp-parsers';
	import { supabase } from '$lib/supabase';
	import { hsNormalize } from '$lib/hs-utils';
	import Spinner from './Spinner.svelte';

	let { onComplete }: { onComplete: () => void } = $props();

	let files = $state<{ name: string; type: string; buf: ArrayBuffer | null }[]>([]);
	let status = $state('');
	let error = $state('');
	let processing = $state(false);

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		const items = e.dataTransfer?.files;
		if (items) await processFiles(items);
	}

	async function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) await processFiles(input.files);
	}

	async function processFiles(fileList: FileList) {
		for (const f of Array.from(fileList)) {
			if (!f.name.match(/\.xlsx?$/i)) continue;
			const buf = await f.arrayBuffer();
			const type = detectFileType(buf);
			files = [...files, { name: f.name, type, buf }];
		}
	}

	async function generate() {
		const nomFile = files.find(f => f.type === 'nomenclature');
		const planFile = files.find(f => f.type === 'materialplan');
		const arrFile = files.find(f => f.type === 'arrivals');

		if (!nomFile?.buf || !planFile?.buf || !arrFile?.buf) {
			error = 'All three files required: Nomenclature, Material Plan, and Arrivals.';
			return;
		}

		processing = true;
		error = '';
		status = 'Parsing files...';

		try {
			const nom = parseNomenclature(nomFile.buf);
			const demand = parseMaterialPlan(planFile.buf);
			const arrivals = parseArrivals(arrFile.buf, 6);

			status = `Parsed: ${Object.keys(nom).length} SKUs, ${demand.length} demand rows, ${arrivals.length} arrivals`;

			// Save to Supabase tables
			status = 'Saving nomenclature...';
			const nomRows = Object.entries(nom).map(([sku, n]: [string, any]) => ({
				sku, name: n.name, source: n.source,
				pallet_qty: n.palletQty, pallet_spc: n.palletSpc,
				hs_code: hsNormalize(n.hsCode || ''), country: n.country, unit_price: n.unitPrice
			}));
			// Batch upsert nomenclature
			for (let i = 0; i < nomRows.length; i += 500) {
				await supabase.from('lp_nomenclature').upsert(nomRows.slice(i, i + 500), { onConflict: 'sku' });
			}

			status = 'Saving demand...';
			await supabase.from('lp_demand').delete().neq('id', 0); // Clear existing
			const demandRows = demand.map(d => ({
				sku: d.sku, destination: d.destination, required_qty: d.requiredQty,
				pallet_qty: nom[d.sku]?.palletQty || 0, pallet_spc: nom[d.sku]?.palletSpc || 0
			}));
			for (let i = 0; i < demandRows.length; i += 500) {
				await supabase.from('lp_demand').insert(demandRows.slice(i, i + 500));
			}

			status = 'Saving arrivals...';
			await supabase.from('lp_arrivals').delete().neq('id', 0);
			const arrRows = arrivals.map(a => ({
				sku: a.sku, name: a.name, container: a.container, qty: a.qty,
				arrival_date: a.arrivalDate, ready_date: a.readyDate, avail_pallets: a.availPallets
			}));
			for (let i = 0; i < arrRows.length; i += 500) {
				await supabase.from('lp_arrivals').insert(arrRows.slice(i, i + 500));
			}

			status = `Done! ${Object.keys(nom).length} SKUs, ${demand.length} demand, ${arrivals.length} arrivals saved.`;
			processing = false;

			// Note: Plan generation needs the v1 engine — not yet ported
			// For now, users generate plans in v1 and sync via migration

			setTimeout(() => onComplete(), 1500);
		} catch (e: any) {
			error = e.message;
			processing = false;
		}
	}

	function removeFile(idx: number) {
		files = files.filter((_, i) => i !== idx);
	}

	function typeLabel(t: string): string {
		return t === 'nomenclature' ? '📋 Nomenclature' : t === 'materialplan' ? '📦 Material Plan' : t === 'arrivals' ? '📥 Arrivals' : '❓ Unknown';
	}

	function typeColor(t: string): string {
		return t === 'nomenclature' ? 'var(--gn)' : t === 'materialplan' ? 'var(--ac)' : t === 'arrivals' ? 'var(--pu)' : 'var(--tt)';
	}
</script>

<div style="max-width:520px;margin:0 auto">
	<h2 style="font-size:18px;font-weight:700;margin-bottom:4px">📦 Load Plan Upload</h2>
	<p style="font-size:12px;color:var(--ts);margin-bottom:16px">Upload Nomenclature, Material Plan, and Arrivals files</p>

	<!-- Drop zone -->
	<label ondrop={handleDrop} ondragover={(e) => e.preventDefault()}
		style="display:block;padding:24px;text-align:center;border:2px dashed var(--bd);border-radius:var(--r);cursor:pointer;margin-bottom:12px;transition:all .15s"
		class="hover-highlight">
		<div style="font-size:28px;margin-bottom:6px">📂</div>
		<div style="font-weight:600;font-size:13px">Drop or click to select .xlsx files</div>
		<input type="file" accept=".xlsx,.xls" multiple onchange={handleInput} style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">
	</label>

	<!-- File list -->
	{#if files.length > 0}
		<div style="margin-bottom:12px">
			{#each files as f, i}
				<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;margin-bottom:4px;background:var(--sf)">
					<span style="font-size:10px;font-weight:600;color:{typeColor(f.type)}">{typeLabel(f.type)}</span>
					<span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{f.name}</span>
					<button onclick={() => removeFile(i)} style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:14px">✕</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Generate button -->
	{#if !processing}
		<button class="mbtn mbtn-primary" onclick={generate}
			style="width:100%;opacity:{files.length >= 3 ? '1' : '.5'}"
			disabled={files.length < 3}>
			Upload & Save to Database
		</button>
	{:else}
		<div style="text-align:center;padding:20px">
			<div class="spn" style="width:24px;height:24px;margin:0 auto 8px"></div>
			<div style="font-size:11px;color:var(--ts)">{status}</div>
		</div>
	{/if}

	{#if error}
		<div style="margin-top:8px;padding:8px 10px;background:var(--rs);color:var(--rd);border-radius:6px;font-size:11px">{error}</div>
	{/if}

	{#if status && !processing}
		<div style="margin-top:8px;padding:8px 10px;background:var(--gs);color:var(--gn);border-radius:6px;font-size:11px">{status}</div>
	{/if}

	<div style="margin-top:16px;font-size:10px;color:var(--tt)">
		Note: File upload saves data to v2 tables. Plan generation currently requires the v1 app — plans will be synced automatically.
	</div>
</div>
