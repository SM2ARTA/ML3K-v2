<script lang="ts">
	import ProgressBar from './ProgressBar.svelte';
	import DestBadge from './DestBadge.svelte';

	let {
		truckId, date, destination, totalQty, totalPallets, maxPallets = 26,
		skuCount, dispatched = false, lsrNumber = '', isAdmin = false,
		arrivalDate = '', transitDays = 0, manualItemCount = 0,
		onToggleDispatch, onDateChange, onLsrSave, onclick
	}: {
		truckId: number; date: string; destination: string; totalQty: number;
		totalPallets: number; maxPallets?: number; skuCount: number;
		dispatched?: boolean; lsrNumber?: string; isAdmin?: boolean;
		arrivalDate?: string; transitDays?: number; manualItemCount?: number;
		onToggleDispatch?: (id: number, checked: boolean) => void;
		onDateChange?: (id: number, date: string) => void;
		onLsrSave?: (id: number, lsr: string) => void;
		onclick?: () => void;
	} = $props();

	let editingLsr = $state(false);
	let lsrInput = $state(lsrNumber);

	function saveLsr() {
		onLsrSave?.(truckId, lsrInput);
		editingLsr = false;
	}
</script>

<div class="truck-card" class:dispatched onclick={() => onclick?.()}>
	<!-- Header -->
	<div class="truck-hd">
		<div style="display:flex;align-items:center;gap:6px;min-width:0">
			<span>{dispatched ? '🔒' : '🚛'}</span>
			<span class="truck-id">LP-{truckId}</span>
			{#if lsrNumber}
				<span class="lsr-badge">{lsrNumber}</span>
			{/if}
			<DestBadge dest={destination} qty={0} compact={false} />
		</div>
		<div class="truck-cap">{totalPallets.toFixed(1)} <span style="font-size:11px;font-weight:400;color:var(--ts)">/ {maxPallets}</span></div>
	</div>

	<!-- Arrival info -->
	{#if arrivalDate}
		<div style="font-size:10px;color:var(--ac);margin-top:3px;font-weight:600">
			📍 Arrives: {arrivalDate} <span style="font-weight:400;color:var(--ts)">({transitDays}d transit)</span>
		</div>
	{/if}

	<!-- Capacity bar -->
	<div style="margin-top:6px">
		<ProgressBar value={totalPallets} max={maxPallets} />
	</div>

	<!-- Stats -->
	<div style="font-size:10px;color:var(--tt);margin-top:4px">
		{skuCount} SKU{skuCount > 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs · {totalPallets.toFixed(1)} plt
	</div>

	{#if manualItemCount > 0}
		<div style="font-size:9px;margin-top:2px">
			<span style="font-size:9px;color:var(--pu);background:var(--ps);padding:1px 5px;border-radius:3px">✏️ {manualItemCount} manual item{manualItemCount > 1 ? 's' : ''}</span>
		</div>
	{/if}

	<!-- Dispatch controls (admin only) -->
	{#if isAdmin}
		<div class="truck-controls" onclick={(e) => e.stopPropagation()}>
			<label style="display:flex;align-items:center;gap:4px;cursor:pointer">
				<input type="checkbox" checked={dispatched} onchange={(e) => onToggleDispatch?.(truckId, e.currentTarget.checked)}>
				<span>{dispatched ? '🔒 Locked' : 'Lock'}</span>
			</label>
			<input type="date" value={date} onchange={(e) => onDateChange?.(truckId, e.currentTarget.value)}
				style="font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;color:var(--ts);width:120px">
		</div>

		<!-- LSR -->
		<div class="truck-controls" onclick={(e) => e.stopPropagation()} style="margin-top:4px">
			<span style="font-size:10px;color:var(--tt)">LSR</span>
			{#if editingLsr}
				<input type="text" bind:value={lsrInput} placeholder="LSR625-001"
					onkeydown={(e) => { if (e.key === 'Enter') saveLsr(); if (e.key === 'Escape') editingLsr = false; }}
					style="font-size:10px;font-family:var(--fm);padding:2px 6px;border:1px solid var(--ac);border-radius:4px;width:105px;outline:none">
				<button onclick={saveLsr} style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--gn)">💾</button>
			{:else}
				<span class="mono" style="font-size:10px;color:{lsrNumber ? 'var(--tp)' : 'var(--tt)'}">{lsrNumber || '—'}</span>
				<button onclick={() => { editingLsr = true; lsrInput = lsrNumber }} style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--ts)">✏️</button>
			{/if}
		</div>
	{:else if dispatched}
		<div class="truck-controls">
			<span>🔒 Locked</span>
		</div>
	{/if}
</div>

<style>
	.truck-card {
		background: var(--sf); border: 1px solid var(--bd); border-radius: var(--r);
		padding: 14px; flex: 1 1 280px; min-width: 240px; max-width: 380px; cursor: pointer;
		transition: all .15s;
	}
	.truck-card:hover { border-color: var(--ac); box-shadow: 0 2px 8px rgba(0,0,0,.06); }
	.truck-card.dispatched { opacity: .7; border-color: var(--gn); background: linear-gradient(135deg, #FAFBFC, #F0FAF4); }
	.truck-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
	.truck-id { font-size: 15px; font-weight: 700; }
	.truck-cap { font-size: 17px; font-weight: 700; text-align: right; font-family: var(--fm); }
	.truck-controls { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; color: var(--ts); }
	.lsr-badge { font-size: 9px; color: var(--pu); background: var(--ps); padding: 1px 5px; border-radius: 3px; font-family: var(--fm); }
</style>
