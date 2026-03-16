<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPSettings, getLPDestinations, getLPHolds, updateCustomsOverride, toggleHSConfirm } from '$lib/db';
	import { role } from '$lib/stores';
	import {
		createSvelteTable,
		type ColumnDef,
		type SortingState
	} from '$lib/table';
	import {
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel
	} from '@tanstack/table-core';

	type DemandRow = {
		sku: string; name: string; source: string; totalQty: number;
		hs_code: string; country: string; unit_price: number; customs_name: string;
		hs_confirmed: boolean; pallet_qty: number; pallet_spc: number;
		totalPallets: number; dests: Record<string, number>;
	};

	let rawDemand = $state<any[]>([]);
	let holds = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state<'demand' | 'plan' | 'arrivals' | 'late'>('demand');
	let globalFilter = $state('');
	let sorting = $state<SortingState>([]);

	let holdSet = $derived(new Set(holds.map(h => `${h.destination}|${h.sku}`)));

	// Transform raw data into display rows
	let data = $derived<DemandRow[]>(rawDemand.map(d => ({
		sku: d.sku, name: d.name || '', source: d.source || '',
		totalQty: d.total_qty || 0,
		hs_code: d.hs_code || '', country: d.country || '',
		unit_price: d.unit_price || 0, customs_name: d.customs_name || '',
		hs_confirmed: d.hs_confirmed || false,
		pallet_qty: d.pallet_qty || 0, pallet_spc: d.pallet_spc || 0,
		totalPallets: d.pallet_qty > 0 ? (d.total_qty / d.pallet_qty) * (d.pallet_spc || 0) : 0,
		dests: d.destinations || {}
	})));

	let grandQty = $derived(data.reduce((s, r) => s + r.totalQty, 0));
	let grandPlt = $derived(data.reduce((s, r) => s + r.totalPallets, 0));
	let confirmedCount = $derived(data.filter(r => r.hs_confirmed).length);

	const columns: ColumnDef<DemandRow, any>[] = [
		{ accessorKey: 'sku', header: 'SKU', size: 140 },
		{ accessorKey: 'name', header: 'Name', size: 200 },
		{ accessorKey: 'source', header: 'Source', size: 80 },
		{ accessorKey: 'totalQty', header: 'Total Qty', size: 80 },
		{ accessorKey: 'unit_price', header: 'Price', size: 70 },
		{ accessorKey: 'hs_code', header: 'HS Code', size: 90 },
		{ accessorKey: 'country', header: 'COO', size: 60 },
		{ accessorKey: 'customs_name', header: 'Customs Name', size: 120 },
		{ accessorKey: 'pallet_qty', header: 'Plt Qty', size: 60 },
		{ accessorKey: 'totalPallets', header: 'Pallets', size: 60 },
	];

	let tableInstance = $derived(createSvelteTable<DemandRow>({
		data,
		columns,
		state: { sorting, globalFilter },
		onSortingChange: (updater: any) => { sorting = typeof updater === 'function' ? updater(sorting) : updater },
		onGlobalFilterChange: (updater: any) => { globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater },
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		globalFilterFn: 'includesString'
	}));

	onMount(async () => {
		loading = true;
		const [d, h] = await Promise.all([getLPDemand(), getLPHolds()]);
		rawDemand = d;
		holds = h;
		loading = false;
	});

	async function onCustomsChange(sku: string, field: string, value: string) {
		if ($role !== 'admin') return;
		const fields: Record<string, any> = {};
		if (field === 'price') fields.price = parseFloat(value) || null;
		else fields[field] = value || null;
		await updateCustomsOverride(sku, fields);
	}

	async function onHSConfirm(sku: string, current: boolean) {
		if ($role !== 'admin') return;
		await toggleHSConfirm(sku, !current);
		rawDemand = await getLPDemand();
	}

	function sortIcon(colId: string): string {
		const s = sorting.find(s => s.id === colId);
		if (!s) return '↕';
		return s.desc ? '↓' : '↑';
	}
</script>

<!-- LP Tab Bar -->
<div style="display:flex;gap:2px;padding:6px 0;margin-bottom:12px;border-bottom:1px solid var(--bd)">
	{#each [['demand','📋 Demand'],['plan','🚛 Plan'],['arrivals','📥 Arrivals'],['late','⚠ Late']] as [tab, label]}
		<button class="rbtn" style={activeTab === tab ? 'background:var(--as);color:var(--ac);border-color:var(--ab)' : ''}
			onclick={() => activeTab = tab as any}>{label}</button>
	{/each}
</div>

{#if loading}
	<div style="text-align:center;padding:40px">
		<div class="spn" style="width:32px;height:32px;margin:0 auto 12px"></div>
		<div style="font-size:12px;color:var(--ts)">Loading demand data...</div>
	</div>
{:else if activeTab === 'demand'}
	<!-- Stats -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
		<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--bg);color:var(--ts);font-weight:600">
			{data.length} SKUs · {grandQty.toLocaleString()} pcs · {grandPlt.toFixed(1)} plt
		</span>
		<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--gs);color:var(--gn);font-weight:600">
			✓ {confirmedCount} confirmed
		</span>
		{#if holds.length > 0}
			<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--os);color:var(--or);font-weight:600">
				⏸ {holds.length} holds
			</span>
		{/if}
	</div>

	<!-- Search -->
	<div style="margin-bottom:10px">
		<input type="text" bind:value={globalFilter} placeholder="Search SKU, name, source..."
			style="width:100%;max-width:400px;padding:7px 12px;border:1px solid var(--bd);border-radius:6px;font-size:11px;font-family:var(--fd);outline:none">
	</div>

	<!-- TanStack Table -->
	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 220px);overflow-y:auto">
		<table class="dtb" style="min-width:1200px">
			<thead style="position:sticky;top:0;z-index:10;background:var(--sf)">
				{#each tableInstance.table.getHeaderGroups() as headerGroup}
					<tr>
						{#each headerGroup.headers as header}
							<th onclick={() => header.column.getToggleSortingHandler()?.(new MouseEvent('click'))}
								style="cursor:pointer;user-select:none;white-space:nowrap;{header.column.getIsSorted() ? 'color:var(--ac)' : ''}">
								{header.column.columnDef.header}
								<span style="font-size:9px;margin-left:2px;opacity:.5">{sortIcon(header.id)}</span>
							</th>
						{/each}
						<th>Destinations</th>
					</tr>
				{/each}
			</thead>
			<tbody>
				{#each tableInstance.table.getRowModel().rows as row (row.original.sku)}
					{@const r = row.original}
					<tr>
						<td class="mono" style="white-space:nowrap;font-weight:600">{r.sku}</td>
						<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={r.name}>{r.name || '—'}</td>
						<td style="font-size:10px;color:var(--ts)">{r.source || '—'}</td>
						<td class="mono fw7">{r.totalQty.toLocaleString()}</td>
						<td class="mono">
							{#if $role === 'admin'}
								<input type="number" step="0.01" value={r.unit_price || ''} onchange={(e) => onCustomsChange(r.sku, 'price', e.currentTarget.value)}
									style="width:55px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}{r.unit_price || '—'}{/if}
						</td>
						<td class="mono" style={r.hs_confirmed ? 'background:var(--gs)' : ''}>
							{#if $role === 'admin'}
								<input type="text" value={r.hs_code || ''} placeholder="0000.00" onchange={(e) => onCustomsChange(r.sku, 'hs_code', e.currentTarget.value)}
									style="width:65px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid {r.hs_confirmed ? 'var(--gn)' : 'var(--bd)'};border-radius:4px;outline:none">
								{#if r.hs_code}
									<button onclick={() => onHSConfirm(r.sku, r.hs_confirmed)}
										style="cursor:pointer;font-size:10px;border:none;background:none;{r.hs_confirmed ? 'color:var(--gn)' : 'color:var(--tt)'}">{r.hs_confirmed ? '✓' : '○'}</button>
								{/if}
							{:else}{r.hs_code || '—'}{/if}
						</td>
						<td class="mono">
							{#if $role === 'admin'}
								<input type="text" value={r.country || ''} placeholder="China" onchange={(e) => onCustomsChange(r.sku, 'country', e.currentTarget.value)}
									style="width:44px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}{r.country || '—'}{/if}
						</td>
						<td>
							{#if $role === 'admin'}
								<input type="text" value={r.customs_name || ''} placeholder="Customs desc" onchange={(e) => onCustomsChange(r.sku, 'customs_name', e.currentTarget.value)}
									style="width:90px;font-size:10px;padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}{r.customs_name || '—'}{/if}
						</td>
						<td class="mono">{r.pallet_qty || '—'}</td>
						<td class="mono">{r.totalPallets > 0 ? r.totalPallets.toFixed(1) : '—'}</td>
						<td style="white-space:normal">
							{#each Object.entries(r.dests).sort((a,b) => b[1] - a[1]) as [dest, qty]}
								<span style="display:inline-block;padding:1px 5px;margin:1px;border-radius:4px;font-size:8px;font-weight:600;background:var(--bg);color:var(--ts);border:1px solid var(--bd);{holdSet.has(`${dest}|${r.sku}`) ? 'opacity:.3;text-decoration:line-through' : ''}">
									{dest.replace(/\s*\/\s*(CORT|RIC)\s*$/i, '').split(' ').map(w => w.slice(0,3)).join(' ')} {qty}
								</span>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="card" style="text-align:center;padding:40px">
		<div style="font-size:14px;font-weight:700;margin-bottom:8px">{activeTab === 'plan' ? '🚛 Plan' : activeTab === 'arrivals' ? '📥 Arrivals' : '⚠ Late'}</div>
		<div style="font-size:12px;color:var(--ts)">Coming soon</div>
	</div>
{/if}
