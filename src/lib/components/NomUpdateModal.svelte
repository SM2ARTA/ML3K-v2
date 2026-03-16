<script lang="ts">
	import Modal from './Modal.svelte';
	import { parseNomenclature } from '$lib/lp-parsers';
	import { hsNormalize } from '$lib/hs-utils';
	import { supabase } from '$lib/supabase';

	let { open = $bindable(false), customsOverrides = {}, onComplete }: {
		open: boolean; customsOverrides?: Record<string, any>; onComplete: () => void;
	} = $props();

	let status = $state('');
	let error = $state('');
	let processing = $state(false);

	async function handleFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		processing = true;
		error = '';

		try {
			const buf = await f.arrayBuffer();
			const newNom = parseNomenclature(buf);
			let updated = 0;

			for (const [sku, nn] of Object.entries(newNom) as [string, any][]) {
				const ovr = customsOverrides[sku] || {};
				const update: Record<string, any> = {};
				if (nn.name) update.name = nn.name;
				if (nn.source) update.source = nn.source;
				// Only update nom-level fields if no manual override exists
				if (nn.hsCode && !ovr.hs_code) update.hs_code = hsNormalize(nn.hsCode);
				if (nn.country && !ovr.country) update.country = nn.country;
				if (nn.unitPrice && !ovr.price) update.unit_price = nn.unitPrice;

				if (Object.keys(update).length > 0) {
					await supabase.from('lp_nomenclature').update(update).eq('sku', sku);
					updated++;
				}
			}

			status = `Updated ${updated} SKUs. Manual overrides preserved.`;
			processing = false;
			setTimeout(() => { onComplete(); open = false; status = ''; }, 2000);
		} catch (e: any) {
			error = e.message;
			processing = false;
		}
		input.value = '';
	}
</script>

<Modal title="📋 Update Nomenclature" subtitle="Partial re-import — preserves manual customs overrides" bind:open maxWidth="480px">
	<div style="font-size:12px;color:var(--ts);margin-bottom:12px">
		Upload a new nomenclature file to update HS codes, country of origin, and prices.
		<br>Manual overrides (purple fields in demand table) will NOT be overwritten.
	</div>

	{#if processing}
		<div style="text-align:center;padding:20px">
			<div class="spn" style="width:24px;height:24px;margin:0 auto 8px"></div>
			<div style="font-size:11px;color:var(--ts)">Updating nomenclature...</div>
		</div>
	{:else}
		<label style="display:block;padding:20px;text-align:center;border:2px dashed var(--bd);border-radius:var(--r);cursor:pointer">
			<div style="font-size:20px;margin-bottom:6px">📂</div>
			<div style="font-weight:600;font-size:12px">Click to select nomenclature .xlsx file</div>
			<input type="file" accept=".xlsx,.xls" onchange={handleFile} style="position:absolute;width:1px;height:1px;opacity:0">
		</label>
	{/if}

	{#if error}<div style="margin-top:8px;padding:8px;background:var(--rs);color:var(--rd);border-radius:6px;font-size:11px">{error}</div>{/if}
	{#if status}<div style="margin-top:8px;padding:8px;background:var(--gs);color:var(--gn);border-radius:6px;font-size:11px">{status}</div>{/if}
</Modal>
