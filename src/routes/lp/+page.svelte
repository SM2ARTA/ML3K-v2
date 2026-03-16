<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPHolds, getLPTruckSummary, getLPPlan, getLPDestinations, getLPTruckDispatch, getLPArrivals, getStockReport, getLPSettings, getLPNomenclature, getLPCustomsOverrides, updateCustomsOverride, toggleHSConfirm, updateTruckDispatch, saveLSR, holdBySource, getLPDemandForHolds, updateLPSettings, updateDestination, upsertContainerOverride, getContainerOverrides, addManualArrival, deleteArrival, upsertPalletOverride, getArrivedContainers, toggleContainerArrived } from '$lib/db';
	import { role } from '$lib/stores';
	import { supabase } from '$lib/supabase';
	import { TabBar, StatBadge, Spinner, SearchInput, FilterDropdown, DestBadge, EditableCell, ConfirmButton, TruckCard, HoldBar, BottomBar, TruckModal, HSLookup, CombinedCIModal, NomUpdateModal, Modal } from '$lib/components';
	import { fmtDate } from '$lib/utils';
	import { captureUndo } from '$lib/undo';
	import { exportLPPlan, exportLPDemand, exportLPArrivals, exportCI } from '$lib/exports';
	import { buildLoadPlan } from '$lib/lp-engine';
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
	let arrivedConts = $state<Set<string>>(new Set());
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
	let lateExclDests = $state(new Set<string>());
	let arrivalSearch = $state('');
	let contModalOpen = $state(false);
	let contModalData = $state<any>(null);
	let filteredArrivals = $derived(
		arrivalSearch
			? arrivals.filter(a => {
				const q = arrivalSearch.toLowerCase();
				return (a.sku || '').toLowerCase().includes(q) || (a.container || '').toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q) || (a.arrival_date || '').includes(q);
			})
			: arrivals
	);

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
		arrivedConts = await getArrivedContainers();
		loading = false;
	});

	async function reloadHolds() {
		holds = await getLPHolds();
	}

	async function handleHold(src: string, dest: string | null, release: boolean) {
		if (!isAdmin) return;
		await captureUndo();
		if (!rawDemandForHolds.length) rawDemandForHolds = await getLPDemandForHolds();
		await holdBySource(rawDemandForHolds, src, dest, release);
		await reloadHolds();
	}

	async function handleDispatch(truckId: number, dispatched: boolean) {
		if (!isAdmin) return;
		await captureUndo();
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
		// Auto-calc ready date if not provided: arrival + turnaround days (skip weekends)
		let readyDate = newArrival.ready_date;
		if (!readyDate) {
			const { addDays, isNonWorkday } = await import('$lib/lp-helpers');
			let d = newArrival.arrival_date;
			let remaining = settings?.turnaround || 6;
			while (remaining > 0) { d = addDays(d, 1); if (!isNonWorkday(d)) remaining--; }
			readyDate = d;
		}
		// Auto-calc pallets from nomenclature
		const nm = nomMap[newArrival.sku];
		const pltCalc = nm && nm.pallet_qty > 0 ? (newArrival.qty / nm.pallet_qty) * (nm.pallet_spc || 0) : 0;
		await addManualArrival({
			sku: newArrival.sku, name: newArrival.name || nm?.name || '', container: newArrival.container || 'MANUAL',
			qty: newArrival.qty, arrival_date: newArrival.arrival_date, ready_date: readyDate,
			avail_pallets: Math.round(pltCalc * 100) / 100
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

	async function handleToggleArrived(containerKey: string) {
		if (!isAdmin || !containerKey) return;
		const isArrived = arrivedConts.has(containerKey);
		await toggleContainerArrived(containerKey, !isArrived);
		const newSet = new Set(arrivedConts);
		if (isArrived) newSet.delete(containerKey); else newSet.add(containerKey);
		arrivedConts = newSet;
	}

	let regenerating = $state(false);

	async function handleRegenerate() {
		if (!isAdmin) return;
		await captureUndo();
		regenerating = true;
		try {
			// Build demand in engine format
			const engineDemand = rawDemand.map((d: any) => {
				const dests = d.destinations || {};
				return Object.entries(dests).map(([dest, qty]) => ({
					destination: dest, sku: d.sku, name: d.name, requiredQty: qty as number,
					palletQty: d.pallet_qty || 0, palletSpc: d.pallet_spc || 0,
					sourceIds: [{ id: `${dest}|${d.sku}`, qty: qty as number }]
				}));
			}).flat();

			// Build arrivals in engine format
			const engineArrivals = arrivals.map(a => ({
				sku: a.sku, name: a.name, qty: a.qty || 0,
				readyDate: a.ready_date || a.arrival_date || '', arrivalDate: a.arrival_date || ''
			}));

			const holdsList = holds.map(h => `${h.destination}|${h.sku}`);
			const stockSkusList = [...stockMap.keys()];

			const newPlan = buildLoadPlan(engineDemand, engineArrivals, {
				maxPallets: settings.max_pallets || 26,
				maxTrucks: settings.max_trucks || 4,
				maxDests: settings.max_dests || 3,
				ricStartDate: settings.ric_start_date || '2026-04-01',
				nomenclature: nomMap,
				holds: holdsList,
				stockSkus: stockSkusList,
				excludeStaples: settings.exclude_staples
			});

			if (newPlan.length) {
				// Save to Supabase
				await supabase.from('lp_plan').delete().neq('id', 0);
				const planRows = newPlan.map(r => ({
					truck_id: r.truckId, dispatch_date: r.date, destination: r.destination,
					sku: r.sku, name: r.name, qty: r.qty, pallets: r.pallets
				}));
				for (let i = 0; i < planRows.length; i += 500) {
					await supabase.from('lp_plan').insert(planRows.slice(i, i + 500));
				}
				await supabase.from('lp_settings').update({ plan_generated: true }).eq('id', 1);
			}

			// Reload
			const [p, td] = await Promise.all([getLPPlan(), getLPTruckDispatch()]);
			planRows = p; truckDispatch = td;
		} catch (e: any) {
			console.error('Regenerate failed:', e);
			alert('Plan generation failed: ' + e.message);
		}
		regenerating = false;
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

	function exportAllCI() {
		const truckIds = [...new Set(planRows.map(r => r.truck_id))];
		for (const tid of truckIds) {
			exportCI(tid, planRows, nomMap, custOvrMap);
		}
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
		{#if isAdmin}
			<button class="rbtn" onclick={handleRegenerate} disabled={regenerating}
				style="font-size:10px;padding:3px 10px;background:var(--as);color:var(--ac);border-color:var(--ab)">
				{regenerating ? '⏳ Generating...' : '🔄 Regenerate Plan'}
			</button>
			<a href="/lp/upload" class="rbtn" style="font-size:10px;padding:3px 10px;text-decoration:none">📂 Upload Files</a>
		{/if}
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
	{@const arrContainers = new Set(arrivals.map(a => a.container).filter(Boolean))}
	{@const arrDates = new Set(arrivals.map(a => a.arrival_date).filter(Boolean))}
	{@const arrTotalQty = arrivals.reduce((s, a) => s + (a.qty || 0), 0)}
	{@const arrTotalPlt = arrivals.reduce((s, a) => s + (a.avail_pallets || 0), 0)}
	{@const arrEarliestReady = arrivals.filter(a => a.ready_date).map(a => a.ready_date).sort()[0] || ''}

	{@const localDeliveries = arrivals.filter(a => (a.container || '').startsWith('Local-') || a.container === 'MANUAL').length > 0 ? new Set(arrivals.filter(a => (a.container || '').startsWith('Local-') || a.container === 'MANUAL').map(a => a.container)).size : 0}
	{@const manualCount = arrivals.filter(a => a.is_manual).length}
	{@const overrideCount = Object.keys(contOverrides).length}

	<!-- KPI Cards -->
	<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:10px">
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700;color:var(--ac)">{arrContainers.size}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Containers</div>
		</div>
		{#if localDeliveries > 0}
			<div class="card" style="padding:8px 10px;text-align:center">
				<div style="font-size:22px;font-weight:700;color:var(--or)">{localDeliveries}</div>
				<div style="font-size:8px;color:var(--ts);font-weight:600">Local Deliveries</div>
			</div>
		{/if}
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700;color:var(--gn)">{arrivedConts.size}<span style="font-size:12px;color:var(--tt)">/{arrContainers.size}</span></div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Arrived</div>
		</div>
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700">{arrDates.size}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Arrival Dates</div>
		</div>
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700;color:var(--pu)">{arrTotalPlt.toFixed(0)}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Pallets</div>
		</div>
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700">{arrTotalQty.toLocaleString()}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Pieces</div>
		</div>
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700">{arrivals.length}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">SKU Lines</div>
		</div>
		{#if manualCount > 0}
			<div class="card" style="padding:8px 10px;text-align:center">
				<div style="font-size:22px;font-weight:700;color:var(--pu)">{manualCount}</div>
				<div style="font-size:8px;color:var(--ts);font-weight:600">Manual Items</div>
			</div>
		{/if}
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:22px;font-weight:700">{settings?.turnaround || 6}d</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">WH Turnaround</div>
		</div>
		<div class="card" style="padding:8px 10px;text-align:center">
			<div style="font-size:16px;font-weight:700;font-family:var(--fm)">{arrEarliestReady || '—'}</div>
			<div style="font-size:8px;color:var(--ts);font-weight:600">Earliest Ready</div>
		</div>
		{#if overrideCount > 0}
			<div class="card" style="padding:8px 10px;text-align:center">
				<div style="font-size:22px;font-weight:700;color:var(--pu)">{overrideCount}</div>
				<div style="font-size:8px;color:var(--ts);font-weight:600">Date Overrides</div>
			</div>
		{/if}
	</div>

	<!-- Search + Add -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
		<input type="text" bind:value={arrivalSearch} placeholder="Search container number..."
			style="flex:1;padding:7px 12px;border:1px solid var(--bd);border-radius:6px;font-size:11px;outline:none">
		{#if isAdmin}
			<button class="rbtn" onclick={() => showAddArrival = !showAddArrival} style="font-size:10px;padding:5px 12px;background:var(--gs);color:var(--gn);border-color:#B8DFCA">
				{showAddArrival ? '✕ Cancel' : '+ Add Item'}
			</button>
		{/if}
	</div>

	<!-- Add manual arrival form -->
	{#if showAddArrival && isAdmin}
		<div class="card" style="margin-bottom:10px;padding:12px">
			<div style="font-size:11px;font-weight:700;margin-bottom:8px">Add Manual Arrival</div>
			<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">SKU *</label>
					<input type="text" bind:value={newArrival.sku} placeholder="SKU-001"
						oninput={(e) => { const nm = nomMap[(e.target as HTMLInputElement).value]; if (nm) { newArrival.name = nm.name || ''; } }}
						style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;font-family:var(--fm);outline:none;box-sizing:border-box"></div>
				<div><label style="font-size:9px;color:var(--ts);display:block;margin-bottom:2px">Name {nomMap[newArrival.sku] ? '✓' : ''}</label>
					<input type="text" bind:value={newArrival.name} placeholder="Product name" style="width:100%;padding:5px 8px;border:1px solid var(--bd);border-radius:4px;font-size:11px;outline:none;box-sizing:border-box;{nomMap[newArrival.sku] ? 'background:var(--gs)' : ''}"></div>
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

	<!-- Container Card Grid -->
	{@const PALETTE = ['#E57373','#64B5F6','#81C784','#FFB74D','#BA68C8','#4DB6AC','#FF8A65','#7986CB','#A1887F','#90A4AE']}
	{@const contGroups = (() => {
		const m = new Map<string, { container: string; items: any[]; totalPlt: number; totalQty: number; skus: Set<string>; arrDate: string; readyDate: string; isLocal: boolean }>();
		for (const a of filteredArrivals) {
			const cid = a.container || '—';
			if (!m.has(cid)) m.set(cid, { container: cid, items: [], totalPlt: 0, totalQty: 0, skus: new Set(), arrDate: a.arrival_date || '', readyDate: a.ready_date || '', isLocal: cid.startsWith('Local-') || cid === 'MANUAL' });
			const g = m.get(cid)!;
			g.items.push(a);
			g.totalPlt += a.avail_pallets || 0;
			g.totalQty += a.qty || 0;
			g.skus.add(a.sku);
			if (a.arrival_date && (!g.arrDate || a.arrival_date < g.arrDate)) g.arrDate = a.arrival_date;
			if (a.ready_date && (!g.readyDate || a.ready_date > g.readyDate)) g.readyDate = a.ready_date;
		}
		return [...m.values()].sort((a, b) => (a.arrDate || '9999').localeCompare(b.arrDate || '9999'));
	})()}
	{@const localCount = contGroups.filter(g => g.isLocal).length}

	<div style="overflow-y:auto;max-height:calc(100vh - {showAddArrival ? '440' : '280'}px)">
		<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
			{#each contGroups as g, gi}
				{@const color = PALETTE[gi % PALETTE.length]}
				{@const hasOverride = contOverrides[g.container]}
				{@const isArrived = arrivedConts.has(g.container)}
				{@const pctFull = g.totalPlt > 0 ? Math.min(100, (g.totalPlt / 26) * 100) : 0}
				<div style="background:var(--sf);border:1.5px solid {hasOverride ? 'var(--pu)' : isArrived ? 'var(--gn)' : color + '44'};border-radius:var(--r);padding:10px;cursor:pointer;{hasOverride ? 'box-shadow:0 0 0 1px var(--pu)' : ''}{isArrived ? 'opacity:.75' : ''}" onclick={() => { contModalData = g; contModalOpen = true; }}>
					<!-- Header -->
					<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
						<span style="width:8px;height:8px;border-radius:50%;background:{color};flex-shrink:0"></span>
						<span style="font-size:11px;font-weight:700;color:{color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{g.isLocal ? '🚚 ' : ''}{g.container}</span>
					</div>
					<!-- Dates -->
					<div style="font-size:10px;color:var(--ts);margin-bottom:2px">📅 {g.arrDate || '—'}</div>
					<div style="font-size:10px;color:var(--ts);margin-bottom:6px">✅ Ready: {g.readyDate || '—'} <span style="color:var(--tt)">(+{settings?.turnaround || 6}d)</span></div>
					<!-- Date override -->
					{#if isAdmin && g.container !== '—'}
						<div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">
							<input type="date" value={hasOverride || g.arrDate || ''}
								onchange={(e) => handleContainerOverride(g.container, (e.target as HTMLInputElement).value)}
								style="font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid {hasOverride ? 'var(--pu)' : 'var(--bd)'};border-radius:4px;outline:none;flex:1;background:{hasOverride ? 'var(--ps)' : 'var(--sf)'}">
							{#if hasOverride}
								<button onclick={() => { handleContainerOverride(g.container, ''); delete contOverrides[g.container]; contOverrides = {...contOverrides}; }}
									style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--rd)" title="Reset to original">✕</button>
							{/if}
						</div>
						{#if hasOverride}
							<div style="font-size:9px;color:var(--pu);margin-bottom:4px;text-decoration:line-through">{g.arrDate}</div>
						{/if}
					{/if}
					<!-- Stats -->
					<div style="display:flex;gap:0;margin-bottom:4px">
						<div style="flex:1;text-align:center;padding:4px 2px;background:var(--bg);border-radius:4px 0 0 4px">
							<div style="font-size:14px;font-weight:700;color:var(--pu)">{g.totalPlt.toFixed(1)}</div>
							<div style="font-size:8px;color:var(--tt)">plt</div>
						</div>
						<div style="flex:1;text-align:center;padding:4px 2px;background:var(--bg)">
							<div style="font-size:14px;font-weight:700">{g.totalQty.toLocaleString()}</div>
							<div style="font-size:8px;color:var(--tt)">pcs</div>
						</div>
						<div style="flex:1;text-align:center;padding:4px 2px;background:var(--bg);border-radius:0 4px 4px 0">
							<div style="font-size:14px;font-weight:700">{g.skus.size}</div>
							<div style="font-size:8px;color:var(--tt)">SKUs</div>
						</div>
					</div>
					<!-- Progress bar -->
					<div style="height:4px;background:var(--bg);border-radius:2px;overflow:hidden;margin-bottom:6px">
						<div style="height:100%;width:{pctFull}%;background:{isArrived ? 'var(--gn)' : color};border-radius:2px;transition:width .2s"></div>
					</div>
					<!-- Mark arrived -->
					<label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--ts);cursor:{isAdmin ? 'pointer' : 'default'}">
						{#if isAdmin && g.container !== '—'}
							<input type="checkbox" checked={isArrived} onchange={() => handleToggleArrived(g.container)}
								style="accent-color:var(--gn);width:13px;height:13px">
						{:else if isArrived}
							<span style="color:var(--gn)">✓</span>
						{/if}
						Mark arrived
					</label>
				</div>
			{/each}
		</div>
	</div>

{:else if activeTab === 'late'}
	<!-- Late Tab — destination-aware late analysis -->
	{@const today = new Date().toISOString().slice(0, 10)}
	{@const todayMs = new Date(today).getTime()}

	<!-- Compute latest dispatch date per destination from plan -->
	{@const destLatestDispatch = (() => {
		const m = new Map();
		for (const r of planRows) {
			if (!r.dispatch_date || !r.destination) continue;
			const dest = destinations.find(d => r.destination.includes(d.name));
			if (!dest) continue;
			const abbr = dest.abbr;
			if (!m.has(abbr) || r.dispatch_date > m.get(abbr)) m.set(abbr, r.dispatch_date);
		}
		return m;
	})()}

	<!-- Compute BI (built-in) date per dest: dispatch + transit + whs -->
	{@const destBI = (() => {
		const m = new Map();
		for (const d of destinations) {
			const disp = destLatestDispatch.get(d.abbr);
			if (!disp) continue;
			const base = new Date(disp);
			base.setDate(base.getDate() + (d.transit_days || 0) + (d.whs_days || 0));
			m.set(d.abbr, base.toISOString().slice(0, 10));
		}
		return m;
	})()}

	<!-- Build SKU -> destinations mapping from plan -->
	{@const skuDests = (() => {
		const m = new Map();
		for (const r of planRows) {
			if (!r.sku || !r.destination) continue;
			const dest = destinations.find(d => r.destination.includes(d.name));
			if (!dest) continue;
			if (!m.has(r.sku)) m.set(r.sku, new Set());
			m.get(r.sku).add(dest.abbr);
		}
		return m;
	})()}

	<!-- Active destinations (not excluded) -->
	{@const activeDests = new Set(destinations.map(d => d.abbr).filter(a => !lateExclDests.has(a)))}

	<!-- Late items: ready_date > today AND belongs to at least one active destination -->
	{@const lateItems = arrivals.filter(a => {
		if (!a.ready_date || a.ready_date <= today) return false;
		const dests = skuDests.get(a.sku);
		if (!dests) return true;
		return [...dests].some(d => activeDests.has(d));
	}).sort((a, b) => (b.ready_date || '').localeCompare(a.ready_date || ''))}

	<!-- Group late items by container -->
	{@const containerGroups = (() => {
		const m = new Map();
		for (const a of lateItems) {
			const cid = a.container || '__none__';
			if (!m.has(cid)) m.set(cid, { container: a.container || '', arrival_date: a.arrival_date || '', ready_date: a.ready_date || '', items: [], dests: new Set() });
			const g = m.get(cid);
			if (a.ready_date > g.ready_date) g.ready_date = a.ready_date;
			if (a.arrival_date && (!g.arrival_date || a.arrival_date < g.arrival_date)) g.arrival_date = a.arrival_date;
			g.items.push(a);
			const sd = skuDests.get(a.sku);
			if (sd) sd.forEach((d: string) => g.dests.add(d));
		}
		return [...m.values()].sort((a, b) => b.ready_date.localeCompare(a.ready_date));
	})()}

	<!-- KPI computations -->
	{@const lateContainers = new Set(lateItems.map(a => a.container).filter(Boolean)).size}
	{@const affectedSkus = new Set(lateItems.map(a => a.sku)).size}
	{@const destsHit = (() => {
		const s = new Set();
		for (const a of lateItems) { const d = skuDests.get(a.sku); if (d) d.forEach((x: string) => s.add(x)); }
		return s.size;
	})()}
	{@const maxDelay = lateItems.reduce((mx, a) => {
		const d = Math.ceil((new Date(a.ready_date).getTime() - todayMs) / 86400000);
		return d > mx ? d : mx;
	}, 0)}

	<!-- Dest late status: does destination have late SKUs? (ignores exclusion for indicator) -->
	{@const destHasLate = (() => {
		const s = new Set();
		for (const a of arrivals) {
			if (!a.ready_date || a.ready_date <= today) continue;
			const dests = skuDests.get(a.sku);
			if (dests) dests.forEach((d: string) => s.add(d));
		}
		return s;
	})()}

	<!-- KPI Cards -->
	<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
		<div class="card" style="padding:14px 16px;text-align:center">
			<div style="font-size:10px;color:var(--ts);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Late Containers</div>
			<div style="font-size:24px;font-weight:800;color:{lateContainers > 0 ? 'var(--or)' : 'var(--gn)'};font-family:var(--fm)">{lateContainers}</div>
		</div>
		<div class="card" style="padding:14px 16px;text-align:center">
			<div style="font-size:10px;color:var(--ts);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Affected SKUs</div>
			<div style="font-size:24px;font-weight:800;color:{affectedSkus > 0 ? 'var(--or)' : 'var(--gn)'};font-family:var(--fm)">{affectedSkus}</div>
		</div>
		<div class="card" style="padding:14px 16px;text-align:center">
			<div style="font-size:10px;color:var(--ts);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Destinations Hit</div>
			<div style="font-size:24px;font-weight:800;color:{destsHit > 0 ? 'var(--rd)' : 'var(--gn)'};font-family:var(--fm)">{destsHit}</div>
		</div>
		<div class="card" style="padding:14px 16px;text-align:center">
			<div style="font-size:10px;color:var(--ts);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Max Delay</div>
			<div style="font-size:24px;font-weight:800;color:{maxDelay > 14 ? 'var(--rd)' : maxDelay > 7 ? 'var(--or)' : 'var(--gn)'};font-family:var(--fm)">{maxDelay}<span style="font-size:12px;font-weight:600">d</span></div>
		</div>
	</div>

	<!-- Main layout: sidebar + content -->
	<div style="display:flex;gap:12px;height:calc(100vh - 280px)">
		<!-- Destination Sidebar -->
		<div class="card" style="width:200px;flex-shrink:0;padding:10px;overflow-y:auto">
			<div style="font-size:10px;font-weight:700;color:var(--ts);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Destinations</div>
			{#each destinations as d}
				{@const hasLate = destHasLate.has(d.abbr)}
				{@const isActive = !lateExclDests.has(d.abbr)}
				{@const biDate = destBI.get(d.abbr)}
				<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;background:{isActive ? 'transparent' : 'var(--bg)'};opacity:{isActive ? 1 : 0.5};transition:all .15s">
					<input type="checkbox" checked={isActive}
						onchange={() => { const s = new Set(lateExclDests); if (s.has(d.abbr)) s.delete(d.abbr); else s.add(d.abbr); lateExclDests = s; }}
						style="accent-color:var(--ac);width:14px;height:14px;cursor:pointer">
					<span style="width:8px;height:8px;border-radius:50%;background:{hasLate ? 'var(--rd)' : 'var(--gn)'};flex-shrink:0"></span>
					<span style="flex:1">
						<span style="font-size:12px;font-weight:700;font-family:var(--fm)">{d.abbr}</span>
						<span style="font-size:10px;color:var(--ts);margin-left:4px">{d.name}</span>
						{#if biDate}
							<div style="font-size:9px;color:var(--tt);font-family:var(--fm);margin-top:1px">BI: {biDate}</div>
						{/if}
					</span>
				</label>
			{/each}
			{#if destinations.length > 0}
				<div style="margin-top:8px;display:flex;gap:4px">
					<button class="rbtn" style="font-size:9px;flex:1" onclick={() => { lateExclDests = new Set(); }}>All</button>
					<button class="rbtn" style="font-size:9px;flex:1" onclick={() => { lateExclDests = new Set(destinations.map(d => d.abbr)); }}>None</button>
				</div>
			{/if}
		</div>

		<!-- Container-grouped detail view -->
		<div style="flex:1;overflow-y:auto;min-width:0">
			{#if lateItems.length === 0}
				<div class="card" style="text-align:center;padding:40px">
					<div style="font-size:32px;margin-bottom:12px">&#10003;</div>
					<div style="font-size:14px;font-weight:700;margin-bottom:6px">All Items On Track</div>
					<div style="font-size:12px;color:var(--ts)">No late arrivals for the selected destinations.</div>
				</div>
			{:else}
				{#each containerGroups as cg}
					{@const daysLate = Math.ceil((new Date(cg.ready_date).getTime() - todayMs) / 86400000)}
					<div class="card" style="margin-bottom:8px;padding:0;overflow:hidden">
						<!-- Container header -->
						<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:{daysLate > 14 ? 'var(--rs)' : daysLate > 7 ? 'var(--os)' : 'var(--bg)'};border-bottom:1px solid var(--bd)">
							<div style="flex:1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
								<span style="font-size:13px;font-weight:800;font-family:var(--fm)">{cg.container || 'No Container'}</span>
								<span style="font-size:10px;color:var(--ts)">Arrival: <b style="font-family:var(--fm)">{cg.arrival_date || '—'}</b></span>
								<span style="font-size:10px;color:var(--ts)">Ready: <b style="font-family:var(--fm)">{cg.ready_date || '—'}</b></span>
								<!-- Destination badges -->
								{#each [...cg.dests].sort() as da}
									<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;font-family:var(--fm);background:var(--ps);color:var(--pu)">{da}</span>
								{/each}
							</div>
							<div style="text-align:right;flex-shrink:0">
								<div style="font-size:20px;font-weight:800;font-family:var(--fm);color:{daysLate > 14 ? 'var(--rd)' : daysLate > 7 ? 'var(--or)' : 'var(--gn)'}">+{daysLate}d</div>
								<div style="font-size:9px;color:var(--ts)">{cg.items.length} SKU{cg.items.length !== 1 ? 's' : ''}</div>
							</div>
						</div>
						<!-- SKU rows -->
						<table class="dtb" style="margin:0">
							<thead>
								<tr style="background:var(--sf)">
									<th style="font-size:10px;padding:4px 10px">SKU</th>
									<th style="font-size:10px;padding:4px 10px">Name</th>
									<th style="font-size:10px;padding:4px 10px;text-align:right">Qty</th>
									<th style="font-size:10px;padding:4px 10px">Ready</th>
									<th style="font-size:10px;padding:4px 10px;text-align:right">Delay</th>
									<th style="font-size:10px;padding:4px 10px">Destinations</th>
								</tr>
							</thead>
							<tbody>
								{#each cg.items as item}
									{@const itemDelay = Math.ceil((new Date(item.ready_date).getTime() - todayMs) / 86400000)}
									{@const itemDests = skuDests.get(item.sku)}
									<tr>
										<td class="mono" style="font-weight:600;font-size:11px">{item.sku}</td>
										<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">{item.name || nomMap[item.sku]?.name || '—'}</td>
										<td class="mono fw7" style="text-align:right;font-size:11px">{(item.qty || 0).toLocaleString()}</td>
										<td class="mono" style="font-size:10px">{item.ready_date}</td>
										<td class="mono" style="text-align:right;font-weight:700;font-size:11px;color:{itemDelay > 14 ? 'var(--rd)' : itemDelay > 7 ? 'var(--or)' : 'var(--gn)'}">+{itemDelay}d</td>
										<td>
											{#if itemDests}
												{#each [...itemDests].sort() as da}
													<span style="font-size:8px;font-weight:600;padding:1px 4px;border-radius:3px;font-family:var(--fm);background:var(--bg);color:var(--ts);margin-right:2px">{da}</span>
												{/each}
											{:else}
												<span style="font-size:9px;color:var(--tt)">—</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			{/if}
		</div>
	</div>
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

<!-- Container Detail Modal -->
{#if contModalData}
	<Modal title="{contModalData.isLocal ? '🚚 Local Delivery' : '📦'} {contModalData.container}" bind:open={contModalOpen}>
		<div style="font-size:12px">
			<!-- Dates -->
			<div style="display:flex;gap:16px;margin-bottom:10px;color:var(--ts);font-size:11px">
				<div>📅 Arrival: <b>{contOverrides[contModalData.container] || contModalData.arrDate || '—'}</b></div>
				<div>✅ Ready: <b>{contModalData.readyDate || '—'}</b> <span style="color:var(--tt)">(+{settings?.turnaround || 6}d)</span></div>
			</div>
			<!-- KPI -->
			<div style="display:flex;gap:16px;margin-bottom:12px">
				<div><span style="color:var(--ts)">SKUs:</span> <b>{contModalData.skus.size}</b></div>
				<div><span style="color:var(--ts)">Pieces:</span> <b>{contModalData.totalQty.toLocaleString()}</b></div>
				<div><span style="color:var(--ts)">Pallets:</span> <b style="color:var(--pu)">{contModalData.totalPlt.toFixed(1)}</b></div>
			</div>
			<!-- Items table -->
			<div style="overflow-x:auto;max-height:400px;overflow-y:auto">
				<table class="dtb">
					<thead style="position:sticky;top:0;background:var(--sf)">
						<tr><th>SKU</th><th>Name</th><th>Source</th><th>Qty</th><th>Pallets</th>{#if isAdmin}<th></th>{/if}</tr>
					</thead>
					<tbody>
						{#each contModalData.items as item}
							{@const nm = nomMap[item.sku]}
							<tr style={item.is_manual ? 'background:var(--ps)' : ''}>
								<td class="mono" style="font-weight:600;font-size:10px">{item.sku}</td>
								<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{nm?.name || item.name || '—'}</td>
								<td style="font-size:10px;color:var(--ts)">{nm?.source || '—'}</td>
								<td class="mono fw7">{(item.qty || 0).toLocaleString()}</td>
								<td class="mono">{item.avail_pallets ? item.avail_pallets.toFixed(2) : '—'}</td>
								{#if isAdmin}
									<td>
										{#if item.is_manual}
											<button onclick={() => { handleDeleteArrival(item.id); contModalData.items = contModalData.items.filter((i: any) => i.id !== item.id); }}
												style="background:none;border:none;cursor:pointer;color:var(--rd);font-size:11px" title="Delete">✕</button>
										{/if}
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</Modal>
{/if}

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
			<button class="rbtn" style="background:var(--ps);color:var(--pu);border-color:#D4C5FE"
				onclick={exportAllCI}>📄 All CIs</button>
		{/if}
		{#if activeTab === 'arrivals' && arrivals.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLPArrivals(arrivals)}>⬇ Export Arrivals</button>
		{/if}
	</BottomBar>
{/if}
