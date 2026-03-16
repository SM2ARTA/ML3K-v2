<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPHolds, getLPTruckSummary, getLPPlan, getLPDestinations, getLPTruckDispatch, getLPArrivals, getStockReport, updateCustomsOverride, toggleHSConfirm, updateTruckDispatch, saveLSR, holdBySource, getLPDemandForHolds } from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, SearchInput, FilterDropdown, DestBadge, EditableCell, ConfirmButton, TruckCard, HoldBar } from '$lib/components';
	import { fmtDate } from '$lib/utils';
	import { createSvelteTable, type ColumnDef, type SortingState } from '$lib/table.svelte';
	import { getCoreRowModel, getSortedRowModel, getFilteredRowModel } from '@tanstack/table-core';

	type DemandRow = {
		sku: string; name: string; source: string; totalQty: number;
		hs_code: string; country: string; unit_price: number; customs_name: string;
		hs_confirmed: boolean; pallet_qty: number; pallet_spc: number;
		totalPallets: number; dests: Record<string, number>; stockQty: number | null;
	};

	let rawDemand = $state<any[]>([]);
	let holds = $state<any[]>([]);
	let planRows = $state<any[]>([]);
	let truckDispatch = $state<any[]>([]);
	let destinations = $state<any[]>([]);
	let arrivals = $state<any[]>([]);
	let stockMap = $state<Map<string, number>>(new Map());
	let rawDemandForHolds = $state<any[]>([]);
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

	// Aggregate plan rows into trucks for Plan tab
	let trucks = $derived.by(() => {
		const map = new Map<number, any>();
		for (const r of planRows) {
			if (!map.has(r.truck_id)) {
				const disp = truckDispatch.find(d => d.truck_id === r.truck_id);
				const dest = destinations.find(d => r.destination?.includes(d.name));
				map.set(r.truck_id, {
					id: r.truck_id, date: r.dispatch_date || '', destination: r.destination || '',
					totalQty: 0, totalPallets: 0, skuCount: 0,
					dispatched: disp?.dispatched || false, lsrNumber: disp?.lsr_number || '',
					transitDays: dest?.transit_days || 0, skus: new Set<string>()
				});
			}
			const t = map.get(r.truck_id)!;
			t.totalQty += r.qty || 0;
			t.totalPallets += r.pallets || 0;
			t.skus.add(r.sku);
		}
		// Finalize SKU counts
		for (const t of map.values()) { t.skuCount = t.skus.size; delete t.skus; }
		return [...map.values()].sort((a, b) => {
			if (a.date !== b.date) return a.date.localeCompare(b.date);
			return a.id - b.id;
		});
	});

	// Group trucks by date for display
	let trucksByDate = $derived.by(() => {
		const groups: { date: string; trucks: any[] }[] = [];
		let currentDate = '';
		for (const t of trucks) {
			if (t.date !== currentDate) {
				currentDate = t.date;
				groups.push({ date: currentDate, trucks: [] });
			}
			groups[groups.length - 1].trucks.push(t);
		}
		return groups;
	});

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
				dests: d.destinations || {},
				stockQty: stockMap.has(d.sku) ? (stockMap.get(d.sku) ?? null) : null
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
		{ accessorKey: 'stockQty', header: 'Stock', size: 60 },
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
		const [d, h, p, td, dest, arr, stock] = await Promise.all([
			getLPDemand(), getLPHolds(), getLPPlan(), getLPTruckDispatch(), getLPDestinations(), getLPArrivals(), getStockReport()
		]);
		rawDemand = d; holds = h; planRows = p; truckDispatch = td; destinations = dest; arrivals = arr;
		stockMap = new Map(stock.map((s: any) => [s.sku, s.qty]));
		loading = false;
	});

	async function reloadHolds() {
		holds = await getLPHolds();
	}

	async function handleHold(src: string, dest: string | null, release: boolean) {
		if (!isAdmin) return;
		if (!rawDemandForHolds.length) rawDemandForHolds = await getLPDemandForHolds();
		await holdBySource(rawDemandForHolds, src, dest, release);
		await reloadHolds();
	}

	async function handleDispatch(truckId: number, dispatched: boolean) {
		if (!isAdmin) return;
		await updateTruckDispatch(truckId, { dispatched });
		truckDispatch = await getLPTruckDispatch();
	}

	async function handleDateChange(truckId: number, date: string) {
		if (!isAdmin) return;
		await updateTruckDispatch(truckId, { dispatched: true });
		// Update plan rows for this truck
		// Note: in v2 we'd update the plan table directly; for now just refresh
		truckDispatch = await getLPTruckDispatch();
	}

	async function handleLsrSave(truckId: number, lsr: string) {
		if (!isAdmin) return;
		await saveLSR(truckId, lsr);
		truckDispatch = await getLPTruckDispatch();
	}

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

	<!-- Hold Bar -->
	<HoldBar sources={allSources} destinations={allDests} {holds} {isAdmin}
		onHold={(src, dest) => handleHold(src, dest, false)}
		onRelease={(src, dest) => handleHold(src, dest, true)} />

	<!-- Table -->
	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 260px);overflow-y:auto">
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
						<td class="mono" style="color:{r.stockQty !== null ? (r.stockQty > 0 ? 'var(--gn)' : 'var(--rd)') : 'var(--tt)'}">
							{r.stockQty !== null ? r.stockQty.toLocaleString() : '—'}
						</td>
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
{:else if activeTab === 'plan'}
	<!-- Plan Tab — Truck Cards -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
		<StatBadge label="{trucks.length} trucks · {trucks.reduce((s,t) => s + t.totalQty, 0).toLocaleString()} pcs · {trucks.reduce((s,t) => s + t.totalPallets, 0).toFixed(1)} plt" />
		<StatBadge label="🔒 {trucks.filter(t => t.dispatched).length} locked" variant="green" />
	</div>

	{#if trucks.length === 0}
		<div class="card" style="text-align:center;padding:40px">
			<div style="font-size:32px;margin-bottom:12px">🚛</div>
			<div style="font-size:14px;font-weight:700;margin-bottom:6px">No Plan Generated</div>
			<div style="font-size:12px;color:var(--ts)">Upload files and generate a plan to see truck assignments.</div>
		</div>
	{:else}
		{#each trucksByDate as group}
			<div style="margin-bottom:16px">
				<div style="font-size:12px;font-weight:700;color:var(--ts);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--bd)">
					📅 {group.date || 'No date'} — {group.trucks.length} truck{group.trucks.length > 1 ? 's' : ''}
				</div>
				<div style="display:flex;flex-wrap:wrap;gap:12px">
					{#each group.trucks as t (t.id)}
						<TruckCard
							truckId={t.id}
							date={t.date}
							destination={t.destination}
							totalQty={t.totalQty}
							totalPallets={t.totalPallets}
							skuCount={t.skuCount}
							dispatched={t.dispatched}
							lsrNumber={t.lsrNumber}
							transitDays={t.transitDays}
							{isAdmin}
							onToggleDispatch={handleDispatch}
							onDateChange={handleDateChange}
							onLsrSave={handleLsrSave}
						/>
					{/each}
				</div>
			</div>
		{/each}
	{/if}

{:else if activeTab === 'arrivals'}
	<!-- Arrivals Tab -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
		<StatBadge label="{arrivals.length} arrival items" />
		<StatBadge label="{arrivals.filter(a => a.is_manual).length} manual" variant="purple" />
	</div>

	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 200px);overflow-y:auto">
		<table class="dtb">
			<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
				<tr>
					<th>SKU</th><th>Name</th><th>Container</th><th>Qty</th>
					<th>Arrival Date</th><th>Ready Date</th><th>Pallets</th><th>Manual</th>
				</tr>
			</thead>
			<tbody>
				{#each arrivals as a}
					<tr>
						<td class="mono" style="font-weight:600">{a.sku}</td>
						<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{a.name || '—'}</td>
						<td class="mono" style="font-size:10px">{a.container || '—'}</td>
						<td class="mono fw7">{(a.qty || 0).toLocaleString()}</td>
						<td class="mono">{a.arrival_date || '—'}</td>
						<td class="mono">{a.ready_date || '—'}</td>
						<td class="mono">{a.avail_pallets ? a.avail_pallets.toFixed(1) : '—'}</td>
						<td>{a.is_manual ? '✏️' : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

{:else}
	<div class="card" style="text-align:center;padding:40px">
		<div style="font-size:14px;font-weight:700;margin-bottom:8px">⚠ Late Analysis</div>
		<div style="font-size:12px;color:var(--ts)">Coming soon — requires LM dispatch dates for comparison</div>
	</div>
{/if}
