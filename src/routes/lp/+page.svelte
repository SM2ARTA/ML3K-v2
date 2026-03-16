<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPHolds, getLPTruckSummary, getLPPlan, getLPDestinations, getLPTruckDispatch, getLPArrivals, getStockReport, getLPSettings, getLPNomenclature, getLPCustomsOverrides, updateCustomsOverride, toggleHSConfirm, updateTruckDispatch, saveLSR, holdBySource, getLPDemandForHolds, updateLPSettings, updateDestination, upsertContainerOverride, getContainerOverrides, addManualArrival, deleteArrival, upsertPalletOverride } from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, SearchInput, FilterDropdown, DestBadge, EditableCell, ConfirmButton, TruckCard, HoldBar, BottomBar, TruckModal, HSLookup, CombinedCIModal, NomUpdateModal } from '$lib/components';
	import { fmtDate } from '$lib/utils';
	import { exportLPPlan, exportLPDemand, exportLPArrivals } from '$lib/exports';
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
	let settings = $state<any>({ turnaround: 6, max_pallets: 26, max_trucks: 4, max_dests: 3, plan_generated: false });
	let nomMap = $state<Record<string, any>>({});
	let custOvrMap = $state<Record<string, any>>({});
	let contOverrides = $state<Record<string, string>>({});
	let showAddArrival = $state(false);
	let newArrival = $state({ sku: '', name: '', container: '', qty: 0, arrival_date: '', ready_date: '' });
	let loading = $state(true);
	let truckModalOpen = $state(false);
	let selectedTruckId = $state(0);
	let hsLookupOpen = $state(false);
	let hsLookupSku = $state('');
	let hsLookupName = $state('');
	let combinedCIOpen = $state(false);
	let nomUpdateOpen = $state(false);
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
		const [d, h, p, td, dest, arr, stock, sets, noms, custOvr] = await Promise.all([
			getLPDemand(), getLPHolds(), getLPPlan(), getLPTruckDispatch(), getLPDestinations(), getLPArrivals(), getStockReport(), getLPSettings(), getLPNomenclature(), getLPCustomsOverrides()
		]);
		rawDemand = d; holds = h; planRows = p; truckDispatch = td; destinations = dest; arrivals = arr;
		stockMap = new Map(stock.map((s: any) => [s.sku, s.qty]));
		if (sets) settings = sets;
		nomMap = Object.fromEntries((noms || []).map((n: any) => [n.sku, n]));
		custOvrMap = Object.fromEntries((custOvr || []).map((c: any) => [c.sku, c]));
		const co = await getContainerOverrides();
		contOverrides = Object.fromEntries(co.map((c: any) => [c.container, c.override_date]));
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

	async function onPalletChange(sku: string, field: string, value: string) {
		if (!isAdmin) return;
		const num = parseFloat(value) || 0;
		const existing = nomMap[sku] || {};
		const pq = field === 'pallet_qty' ? num : (existing.pallet_qty || 0);
		const ps = field === 'pallet_spc' ? num : (existing.pallet_spc || 0);
		if (pq > 0 && ps > 0) await upsertPalletOverride(sku, pq, ps);
	}

	async function handleContainerOverride(container: string, date: string) {
		if (!isAdmin || !container) return;
		await upsertContainerOverride(container, date);
		contOverrides = { ...contOverrides, [container]: date };
	}

	async function handleAddArrival() {
		if (!isAdmin) return;
		if (!newArrival.sku || !newArrival.arrival_date) return;
		await addManualArrival({
			sku: newArrival.sku, name: newArrival.name, container: newArrival.container || 'MANUAL',
			qty: newArrival.qty, arrival_date: newArrival.arrival_date, ready_date: newArrival.ready_date || newArrival.arrival_date,
			avail_pallets: 0
		});
		arrivals = await getLPArrivals();
		showAddArrival = false;
		newArrival = { sku: '', name: '', container: '', qty: 0, arrival_date: '', ready_date: '' };
	}

	async function handleDeleteArrival(id: number) {
		if (!isAdmin) return;
		await deleteArrival(id);
		arrivals = await getLPArrivals();
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
	<div style="display:flex;gap:8px;align-items:stretch;margin-bottom:8px">
		<div style="flex:1">
			<HoldBar sources={allSources} destinations={allDests} {holds} {isAdmin}
				onHold={(src, dest) => handleHold(src, dest, false)}
				onRelease={(src, dest) => handleHold(src, dest, true)} />
		</div>
		<button class="rbtn" onclick={() => combinedCIOpen = true}
			style="font-size:10px;padding:8px 12px;background:var(--ps);color:var(--pu);border-color:#D4C5FE;font-weight:600;white-space:nowrap;align-self:start">
			📄 Combined CI
		</button>
	</div>

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
							{#if isAdmin}<button onclick={() => { hsLookupSku = r.sku; hsLookupName = r.name; hsLookupOpen = true; }} style="cursor:pointer;font-size:11px;border:none;background:none;opacity:.5" title="HS Code Lookup">🔍</button>{/if}
						</td>
						<td><EditableCell value={r.country || ''} placeholder="China" width="44px" {isAdmin} onsave={(v) => onCustomsChange(r.sku, 'country', v)} /></td>
						<td><EditableCell value={r.customs_name || ''} placeholder="Customs desc" width="90px" {isAdmin} onsave={(v) => onCustomsChange(r.sku, 'customs_name', v)} /></td>
						<td class="mono">
							{#if isAdmin}
								<input type="number" value={r.pallet_qty || ''} min="1" step="1" placeholder="qty"
									onchange={(e) => onPalletChange(r.sku, 'pallet_qty', e.currentTarget.value)}
									style="width:45px;font-size:10px;font-family:var(--fm);padding:2px 3px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}{r.pallet_qty || '—'}{/if}
						</td>
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

	<!-- Engine Settings -->
	{#if isAdmin}
		<details style="margin-bottom:12px">
			<summary style="font-size:11px;font-weight:600;color:var(--ts);cursor:pointer;user-select:none">⚙ Engine Settings</summary>
			<div class="card" style="margin-top:6px;padding:12px">
				<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
					<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">Truck Capacity (plt)</label>
						<input type="number" value={settings.max_pallets} min="1" onchange={(e) => { settings.max_pallets = +e.currentTarget.value; updateLPSettings({max_pallets: settings.max_pallets}) }}
							style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:var(--fm);outline:none"></div>
					<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">Max Trucks/Day</label>
						<input type="number" value={settings.max_trucks} min="1" onchange={(e) => { settings.max_trucks = +e.currentTarget.value; updateLPSettings({max_trucks: settings.max_trucks}) }}
							style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:var(--fm);outline:none"></div>
					<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">Max Dests/Day</label>
						<input type="number" value={settings.max_dests} min="1" onchange={(e) => { settings.max_dests = +e.currentTarget.value; updateLPSettings({max_dests: settings.max_dests}) }}
							style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:var(--fm);outline:none"></div>
					<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">WH Turnaround (days)</label>
						<input type="number" value={settings.turnaround} min="0" onchange={(e) => { settings.turnaround = +e.currentTarget.value; updateLPSettings({turnaround: settings.turnaround}) }}
							style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:var(--fm);outline:none"></div>
					<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">RIC Start Date</label>
						<input type="date" value={settings.ric_start_date} onchange={(e) => { settings.ric_start_date = e.currentTarget.value; updateLPSettings({ric_start_date: settings.ric_start_date}) }}
							style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:12px;font-family:var(--fd);outline:none"></div>
				</div>
			</div>
		</details>

		<details style="margin-bottom:12px">
			<summary style="font-size:11px;font-weight:600;color:var(--ts);cursor:pointer;user-select:none">🚚 Transit Times</summary>
			<div class="card" style="margin-top:6px;padding:12px">
				<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
					{#each destinations as d}
						<div><label style="font-size:10px;color:var(--ts);font-weight:600;display:block;margin-bottom:2px">{d.name}</label>
							<div style="display:flex;gap:4px">
								<input type="number" value={d.transit_days} min="0" max="30" title="Transit days"
									onchange={(e) => updateDestination(d.abbr, {transit_days: +e.currentTarget.value})}
									style="flex:1;padding:4px 6px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none">
								<input type="number" value={d.whs_days} min="0" max="30" title="WHS processing days"
									onchange={(e) => updateDestination(d.abbr, {whs_days: +e.currentTarget.value})}
									style="flex:1;padding:4px 6px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none">
							</div>
							<div style="font-size:8px;color:var(--tt);margin-top:1px">transit / whs</div>
						</div>
					{/each}
				</div>
			</div>
		</details>
	{/if}

	{#if trucks.length === 0}
		<div class="card" style="text-align:center;padding:40px">
			<div style="font-size:32px;margin-bottom:12px">🚛</div>
			<div style="font-size:14px;font-weight:700;margin-bottom:6px">No Plan Generated</div>
			<div style="font-size:12px;color:var(--ts);margin-bottom:12px">Upload files and generate a plan to see truck assignments.</div>
			{#if isAdmin}<a href="/lp/upload" class="mbtn mbtn-primary" style="text-decoration:none">📂 Upload Files</a>{/if}
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
							onclick={() => { selectedTruckId = t.id; truckModalOpen = true; }}
						/>
					{/each}
				</div>
			</div>
		{/each}
	{/if}

{:else if activeTab === 'arrivals'}
	<!-- Arrivals Tab -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
		<StatBadge label="{arrivals.length} arrival items" />
		<StatBadge label="{arrivals.filter(a => a.is_manual).length} manual" variant="purple" />
		<StatBadge label="{Object.keys(contOverrides).length} date overrides" variant="orange" />
		{#if isAdmin}
			<button class="rbtn" onclick={() => showAddArrival = !showAddArrival} style="font-size:10px;padding:3px 8px;background:var(--gs);color:var(--gn);border-color:#B8DFCA">
				{showAddArrival ? '✕ Cancel' : '+ Add Manual'}
			</button>
		{/if}
	</div>

	<!-- Add manual arrival form -->
	{#if showAddArrival && isAdmin}
		<div class="card" style="margin-bottom:10px;padding:12px">
			<div style="font-size:11px;font-weight:700;margin-bottom:8px">Add Manual Arrival</div>
			<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">SKU *</label>
					<input type="text" bind:value={newArrival.sku} placeholder="SKU-001" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Name</label>
					<input type="text" bind:value={newArrival.name} placeholder="Product name" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Container</label>
					<input type="text" bind:value={newArrival.container} placeholder="CONT-001" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Qty</label>
					<input type="number" bind:value={newArrival.qty} style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Arrival Date *</label>
					<input type="date" bind:value={newArrival.arrival_date} style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Ready Date</label>
					<input type="date" bind:value={newArrival.ready_date} style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;outline:none;box-sizing:border-box"></div>
			</div>
			<button class="mbtn mbtn-primary" onclick={handleAddArrival} style="margin-top:8px;padding:6px 16px;font-size:11px">Add Arrival</button>
		</div>
	{/if}

	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - {showAddArrival ? '360' : '200'}px);overflow-y:auto">
		<table class="dtb">
			<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
				<tr>
					<th>SKU</th><th>Name</th><th>Container</th><th>Qty</th>
					<th>Arrival Date</th><th>Ready Date</th><th>Pallets</th><th></th>
				</tr>
			</thead>
			<tbody>
				{#each arrivals as a}
					{@const hasOverride = a.container && contOverrides[a.container]}
					<tr style={a.is_manual ? 'background:var(--ps)' : hasOverride ? 'background:var(--os)' : ''}>
						<td class="mono" style="font-weight:600">{a.sku}</td>
						<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{a.name || '—'}</td>
						<td class="mono" style="font-size:10px">{a.container || '—'}</td>
						<td class="mono fw7">{(a.qty || 0).toLocaleString()}</td>
						<td class="mono">
							{#if isAdmin && a.container}
								<input type="date" value={contOverrides[a.container] || a.arrival_date || ''}
									onchange={(e) => handleContainerOverride(a.container, e.currentTarget.value)}
									style="font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid {hasOverride ? 'var(--or)' : 'var(--bd)'};border-radius:4px;outline:none;width:110px;background:{hasOverride ? 'var(--os)' : 'var(--sf)'}">
							{:else}
								{hasOverride ? contOverrides[a.container] : a.arrival_date || '—'}
							{/if}
						</td>
						<td class="mono">{a.ready_date || '—'}</td>
						<td class="mono">{a.avail_pallets ? a.avail_pallets.toFixed(1) : '—'}</td>
						<td>
							{#if a.is_manual}
								<span style="font-size:9px;color:var(--pu);background:var(--ps);padding:1px 4px;border-radius:3px">✏️ manual</span>
								{#if isAdmin}
									<button onclick={() => handleDeleteArrival(a.id)} style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:12px;margin-left:4px" title="Delete">✕</button>
								{/if}
							{:else if hasOverride}
								<span style="font-size:9px;color:var(--or)">📅 override</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

{:else if activeTab === 'late'}
	<!-- Late Tab — basic arrival analysis -->
	{@const lateItems = arrivals.filter(a => {
		if (!a.ready_date) return false;
		const today = new Date().toISOString().slice(0, 10);
		return a.ready_date > today;
	}).sort((a, b) => (a.ready_date || '').localeCompare(b.ready_date || ''))}
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
		<StatBadge label="{lateItems.length} items not yet ready" variant={lateItems.length > 0 ? 'orange' : 'green'} />
		<StatBadge label="{arrivals.filter(a => a.ready_date && a.ready_date <= new Date().toISOString().slice(0, 10)).length} ready now" variant="green" />
	</div>

	{#if lateItems.length === 0}
		<div class="card" style="text-align:center;padding:40px">
			<div style="font-size:32px;margin-bottom:12px">✅</div>
			<div style="font-size:14px;font-weight:700;margin-bottom:6px">All Items Ready</div>
			<div style="font-size:12px;color:var(--ts)">All arrival items have passed their ready date.</div>
		</div>
	{:else}
		<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 220px);overflow-y:auto">
			<table class="dtb">
				<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
					<tr><th>SKU</th><th>Name</th><th>Container</th><th>Qty</th><th>Arrival</th><th>Ready</th><th>Days Until Ready</th></tr>
				</thead>
				<tbody>
					{#each lateItems as a}
						{@const daysLeft = Math.ceil((new Date(a.ready_date).getTime() - Date.now()) / 86400000)}
						<tr>
							<td class="mono" style="font-weight:600">{a.sku}</td>
							<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{a.name || '—'}</td>
							<td class="mono" style="font-size:10px">{a.container || '—'}</td>
							<td class="mono fw7">{(a.qty || 0).toLocaleString()}</td>
							<td class="mono">{a.arrival_date || '—'}</td>
							<td class="mono">{a.ready_date || '—'}</td>
							<td class="mono" style="color:{daysLeft > 14 ? 'var(--rd)' : daysLeft > 7 ? 'var(--or)' : 'var(--gn)'};font-weight:700">
								{daysLeft}d
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<!-- Nom Update Modal -->
<NomUpdateModal bind:open={nomUpdateOpen} customsOverrides={custOvrMap}
	onComplete={async () => { rawDemand = await getLPDemand(); nomMap = Object.fromEntries(((await getLPNomenclature()) || []).map((n) => [n.sku, n])); }} />

<!-- Combined CI Modal -->
<CombinedCIModal bind:open={combinedCIOpen} demandData={data} nomenclature={nomMap} customsOverrides={custOvrMap} />

<!-- HS Code Lookup Modal -->
<HSLookup bind:open={hsLookupOpen} sku={hsLookupSku} name={hsLookupName}
	demandData={data} customsOverrides={custOvrMap}
	onAccept={async () => { rawDemand = await getLPDemand(); custOvrMap = Object.fromEntries(((await getLPCustomsOverrides()) || []).map((c) => [c.sku, c])); }} />

<!-- Truck Detail Modal -->
<TruckModal bind:open={truckModalOpen} truckId={selectedTruckId} {planRows} {truckDispatch} maxPallets={settings.max_pallets} nomenclature={nomMap} customsOverrides={custOvrMap} />

<!-- Bottom Bar -->
{#if !loading}
	<BottomBar>
		{#if activeTab === 'demand' && data.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLPDemand(data)}>⬇ Export Demand</button>
			{#if isAdmin}
				<button class="rbtn" onclick={() => nomUpdateOpen = true} style="font-size:10px">📋 Update Nom</button>
			{/if}
		{/if}
		{#if activeTab === 'plan' && planRows.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLPPlan(planRows, truckDispatch, destinations, 26)}>⬇ Export Plan</button>
		{/if}
		{#if activeTab === 'arrivals' && arrivals.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLPArrivals(arrivals)}>⬇ Export Arrivals</button>
		{/if}
	</BottomBar>
{/if}
