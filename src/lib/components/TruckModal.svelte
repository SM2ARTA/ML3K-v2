<script lang="ts">
	import Modal from './Modal.svelte';
	import DestBadge from './DestBadge.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import { exportLPDemand } from '$lib/exports';

	let { open = $bindable(false), truckId, planRows, truckDispatch, maxPallets = 26, nomenclature = {} }: {
		open: boolean; truckId: number; planRows: any[]; truckDispatch: any[];
		maxPallets?: number; nomenclature?: Record<string, any>;
	} = $props();

	// Filter plan rows for this truck and aggregate by SKU
	let truckItems = $derived.by(() => {
		const items = planRows.filter(r => r.truck_id === truckId);
		const map = new Map<string, { sku: string; name: string; qty: number; pallets: number }>();
		for (const r of items) {
			if (!map.has(r.sku)) map.set(r.sku, { sku: r.sku, name: r.name || '', qty: 0, pallets: 0 });
			const s = map.get(r.sku)!;
			s.qty += r.qty || 0;
			s.pallets += r.pallets || 0;
		}
		return [...map.values()].sort((a, b) => b.pallets - a.pallets);
	});

	let disp = $derived(truckDispatch.find(d => d.truck_id === truckId));
	let totalQty = $derived(truckItems.reduce((s, r) => s + r.qty, 0));
	let totalPlt = $derived(truckItems.reduce((s, r) => s + r.pallets, 0));
	let dest = $derived(planRows.find(r => r.truck_id === truckId)?.destination || '');
	let date = $derived(planRows.find(r => r.truck_id === truckId)?.dispatch_date || '');
</script>

<Modal title="LP-{truckId}" subtitle="{dest} · {date}" bind:open maxWidth="700px">
	<!-- Summary -->
	<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
		<DestBadge {dest} qty={0} showQty={false} />
		{#if disp?.dispatched}
			<span style="font-size:10px;color:var(--gn);font-weight:600">🔒 Locked</span>
		{/if}
		{#if disp?.lsr_number}
			<span style="font-size:10px;color:var(--pu);background:var(--ps);padding:2px 6px;border-radius:4px;font-family:var(--fm)">{disp.lsr_number}</span>
		{/if}
	</div>

	<!-- Capacity -->
	<div style="margin-bottom:12px">
		<ProgressBar value={totalPlt} max={maxPallets} />
	</div>

	<div style="font-size:11px;color:var(--ts);margin-bottom:12px">
		{truckItems.length} SKUs · {totalQty.toLocaleString()} pcs · {totalPlt.toFixed(1)} pallets
	</div>

	<!-- SKU manifest table -->
	<div style="overflow-x:auto;max-height:400px;overflow-y:auto;border:1px solid var(--bd);border-radius:var(--r)">
		<table class="dtb">
			<thead style="position:sticky;top:0;background:var(--sf)">
				<tr>
					<th>#</th><th>SKU</th><th>Name</th><th>Qty</th><th>Pallets</th>
				</tr>
			</thead>
			<tbody>
				{#each truckItems as item, i}
					<tr>
						<td style="color:var(--tt);font-size:10px">{i + 1}</td>
						<td class="mono" style="font-weight:600">{item.sku}</td>
						<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{item.name || '—'}</td>
						<td class="mono fw7">{item.qty.toLocaleString()}</td>
						<td class="mono">{item.pallets.toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr style="font-weight:700;border-top:2px solid var(--bd)">
					<td></td><td></td><td style="color:var(--ts)">Total</td>
					<td class="mono">{totalQty.toLocaleString()}</td>
					<td class="mono">{totalPlt.toFixed(2)}</td>
				</tr>
			</tfoot>
		</table>
	</div>
</Modal>
