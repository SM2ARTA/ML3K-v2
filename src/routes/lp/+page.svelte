<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPHolds, updateCustomsOverride, toggleHSConfirm } from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, SearchInput, FilterDropdown, DestBadge, EditableCell, ConfirmButton } from '$lib/components';
	import { createSvelteTable, type ColumnDef, type SortingState } from '$lib/table.svelte';
	import { getCoreRowModel, getSortedRowModel, getFilteredRowModel } from '@tanstack/table-core';

	type DemandRow = {
		sku: string; name: string; source: string; totalQty: number;
		hs_code: string; country: string; unit_price: number; customs_name: string;
		hs_confirmed: boolean; pallet_qty: number; pallet_spc: number;
		totalPallets: number; dests: Record<string, number>;
	};

	let rawDemand = $state<any[]>([]);
	let holds = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state('demand');
	let globalFilter = $state('');
	let sorting = $state<SortingState>([]);
	let selectedSources = $state(new Set<string>());
	let selectedDests = $state(new Set<string>());

	const lpTabs = [
		{ id: 'demand', label: '📋 Demand' },
		{ id: 'plan', label: '🚛 Plan' },
		{ id: 'arrivals', label: '📥 Arrivals' },
		{ id: 'late', label: '⚠ Late' }
	];

	let holdSet = $derived(new Set(holds.map(h => `${h.destination}|${h.sku}`)));

	// Handle both RPC format (aggregated) and view format (individual rows)
	let data = $derived.by<DemandRow[]>(() => {
		if (!rawDemand.length) return [];
		if (rawDemand[0].destinations !== undefined) {
			return rawDemand.map(d => ({
				sku: d.sku, name: d.name || '', source: d.source || '',
				totalQty: d.total_qty || 0,
				hs_code: d.hs_code || '', country: d.country || '',
				unit_price: d.unit_price || 0, customs_name: d.customs_name || '',
				hs_confirmed: d.hs_confirmed || false,
				pallet_qty: d.pallet_qty || 0, pallet_spc: d.pallet_spc || 0,
				totalPallets: d.pallet_qty > 0 ? (d.total_qty / d.pallet_qty) * (d.pallet_spc || 0) : 0,
				dests: d.destinations || {}
			}));
		}
		const map = new Map<string, DemandRow>();
		for (const d of rawDemand) {
			if (!map.has(d.sku)) {
				map.set(d.sku, { sku: d.sku, name: d.name || '', source: d.source || '', totalQty: 0,
					hs_code: d.hs_code || '', country: d.country || '', unit_price: d.unit_price || 0,
					customs_name: d.customs_name || '', hs_confirmed: d.hs_confirmed || false,
					pallet_qty: d.pallet_qty || 0, pallet_spc: d.pallet_spc || 0, totalPallets: 0, dests: {} });
			}
			const row = map.get(d.sku)!;
			row.totalQty += d.required_qty || 0;
			if (d.pallet_qty > 0) row.totalPallets += ((d.required_qty || 0) / d.pallet_qty) * (d.pallet_spc || 0);
			row.dests[d.destination] = (row.dests[d.destination] || 0) + (d.required_qty || 0);
		}
		return [...map.values()].sort((a, b) => a.sku.localeCompare(b.sku));
	});

	let allSources = $derived([...new Set(data.map(d => d.source).filter(Boolean))].sort());
	let allDests = $derived([...new Set(data.flatMap(d => Object.keys(d.dests)))].sort());
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
		data, columns,
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
		rawDemand = d; holds = h; loading = false;
	});

	const isAdmin = $derived($role === 'admin');

	async function onCustomsChange(sku: string, field: string, value: string) {
		if (!isAdmin) return;
		const fields: Record<string, any> = {};
		if (field === 'price') fields.price = parseFloat(value) || null;
		else fields[field] = value || null;
		await updateCustomsOverride(sku, fields);
	}

	async function onHSConfirm(sku: string, current: boolean) {
		if (!isAdmin) return;
		await toggleHSConfirm(sku, !current);
		rawDemand = await getLPDemand();
	}

	function sortIcon(colId: string): string {
		const s = sorting.find(s => s.id === colId);
		return !s ? '↕' : s.desc ? '↓' : '↑';
	}
</script>

<TabBar tabs={lpTabs} active={activeTab} onchange={(id) => activeTab = id} />

{#if loading}
	<Spinner message="Loading demand data..." />
{:else if activeTab === 'demand'}
	<!-- Stats -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
		<StatBadge label="{data.length} SKUs · {grandQty.toLocaleString()} pcs · {grandPlt.toFixed(1)} plt" />
		<StatBadge label="✓ {confirmedCount} confirmed" variant="green" />
		{#if holds.length > 0}
			<StatBadge label="⏸ {holds.length} holds" variant="orange" />
		{/if}
	</div>

	<!-- Filters -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
		<SearchInput bind:value={globalFilter} placeholder="Search SKU, name, source..." />
		<FilterDropdown label="Sources" items={allSources} bind:selected={selectedSources} allLabel="All" />
		<FilterDropdown label="Destinations" items={allDests} bind:selected={selectedDests} allLabel="All" />
	</div>

	<!-- Table -->
	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 220px);overflow-y:auto">
		<table class="dtb" style="min-width:1200px">
			<thead style="position:sticky;top:0;z-index:10;background:var(--sf)">
				{#each tableInstance.table.getHeaderGroups() as headerGroup}
					<tr>
						{#each headerGroup.headers as header}
							<th onclick={() => header.column.getToggleSortingHandler()?.(new MouseEvent('click'))}
								style="cursor:pointer;user-select:none;{header.column.getIsSorted() ? 'color:var(--ac)' : ''}">
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
						<td><EditableCell value={r.unit_price || ''} type="number" placeholder="0.00" width="55px" {isAdmin} onsave={(v) => onCustomsChange(r.sku, 'price', v)} /></td>
						<td style={r.hs_confirmed ? 'background:var(--gs)' : ''}>
							<EditableCell value={r.hs_code || ''} placeholder="0000.00" width="65px" {isAdmin} confirmed={r.hs_confirmed} onsave={(v) => onCustomsChange(r.sku, 'hs_code', v)} />
							<ConfirmButton confirmed={r.hs_confirmed} visible={!!r.hs_code && isAdmin} ontoggle={() => onHSConfirm(r.sku, r.hs_confirmed)} />
						</td>
						<td><EditableCell value={r.country || ''} placeholder="China" width="44px" {isAdmin} onsave={(v) => onCustomsChange(r.sku, 'country', v)} /></td>
						<td><EditableCell value={r.customs_name || ''} placeholder="Customs desc" width="90px" {isAdmin} onsave={(v) => onCustomsChange(r.sku, 'customs_name', v)} /></td>
						<td class="mono">{r.pallet_qty || '—'}</td>
						<td class="mono">{r.totalPallets > 0 ? r.totalPallets.toFixed(1) : '—'}</td>
						<td style="white-space:normal">
							{#each Object.entries(r.dests).sort((a, b) => b[1] - a[1]) as [dest, qty]}
								<DestBadge {dest} {qty} isHeld={holdSet.has(`${dest}|${r.sku}`)} compact />
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="card" style="text-align:center;padding:40px">
		<div style="font-size:14px;font-weight:700;margin-bottom:8px">
			{activeTab === 'plan' ? '🚛 Plan' : activeTab === 'arrivals' ? '📥 Arrivals' : '⚠ Late'}
		</div>
		<div style="font-size:12px;color:var(--ts)">Coming soon</div>
	</div>
{/if}
