<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getLMNomenclature, getLMDemand, getLMVenueSettings, updateLMVenueSettings,
		getLMDispatch, updateLMDispatch, getLMPalletConfig, updateLMPalletConfig,
		getLMDemandAdj, upsertLMDemandAdj, removeLMDemandAdj,
		getLMNomOverrides, upsertLMNomOverride, removeLMNomOverride,
		getLMManualDemand, addLMManualDemand, removeLMManualDemand,
		getLMKits, addLMKit, removeLMKit,
		getLMStpDeliveries, upsertLMStpDelivery, removeLMStpDelivery,
		getLMExcluded, addLMExcluded, removeLMExcluded,
		getLMManualItems, addLMManualItem, removeLMManualItem,
		getLMDistOverrides, upsertLMDistOverride, removeLMDistOverride,
		getStockQtyMap, getAppSetting, updateAppSetting
	} from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, Card, ProgressBar, Modal, BottomBar } from '$lib/components';
	import { buildLMPlan, type LMTruckDay } from '$lib/lm-engine';
	import { captureUndo } from '$lib/undo';
	import { exportLMDemand, exportLMVenues, exportLMTruckPlan } from '$lib/exports';

	// ── State ──
	let noms = $state<any[]>([]);
	let demand = $state<any[]>([]);
	let venueSettings = $state<any[]>([]);
	let dispatchState = $state<any[]>([]);
	let palletConfig = $state<any[]>([]);
	let demandAdj = $state<Record<string, number>>({});
	let nomOverrides = $state<Record<string, any>>({});
	let manualDemand = $state<any[]>([]);
	let kits = $state<any[]>([]);
	let stpDeliveries = $state<any[]>([]);
	let excluded = $state<Set<string>>(new Set());
	let manualItems = $state<any[]>([]);
	let distOverrides = $state<Record<string, number>>({});
	let stockQtys = $state<Record<string, number>>({});
	let clusterTurnaround = $state(5);

	let loading = $state(true);
	let loadError = $state('');
	let activeTab = $state('dashboard');
	let searchText = $state('');
	let selectedVenue = $state('');
	let selectedCluster = $state('');
	let sidebarOpen = $state(true);
	let regionFilter = $state('all'); // all | us | can | mex
	const isAdmin = $derived($role === 'admin');

	// Modals
	let showVenueSettingsModal = $state(false);
	let editingVenue = $state('');
	let vsForm = $state({ truck_capacity: 26, max_trucks: 2, lead_time: 3 });
	let showAddDemandModal = $state(false);
	let addDemandForm = $state({ venue: '', sku: '', name: '', source: '', qty: 0, bumpInDate: '' });
	let showKitModal = $state(false);
	let kitForm = $state({ venue: '', sku: '', name: '', pallet_qty: 0, pallet_spc: 0, items: [] as { sku: string; qty: number }[] });
	let showStpModal = $state(false);
	let stpForm = $state({ id: 0, venue: '', delivery_date: '', rate: 0 });
	let showNomOvrModal = $state(false);
	let nomOvrSku = $state('');
	let nomOvrForm = $state({ pallet_qty: 0, pallet_spc: 0, pallet_qty_asm: 0, pallet_spc_asm: 0 });
	let showPalletCfgModal = $state(false);
	let showTruckModal = $state(false);
	let modalTruck = $state<any>(null);
	let modalDay = $state<any>(null);
	let showNoPalletModal = $state(false);
	let showNoBIModal = $state(false);

	const lmTabs = [
		{ id: 'dashboard', label: '📊 Dashboard' },
		{ id: 'demand', label: '📋 Demand' },
		{ id: 'trucks', label: '🚛 Trucks' }
	];

	// ── Load (two-phase: critical first, then secondary) ──
	onMount(async () => {
		try {
			// Phase 1: Core data needed to render dashboard (3 queries)
			const [n, d, v] = await Promise.all([
				getLMNomenclature(), getLMDemand(), getLMVenueSettings()
			]);
			noms = n; demand = d; venueSettings = v;
			loading = false; // Show page immediately

			// Phase 2: Secondary data loaded in background (12 queries)
			const [disp, pc, adj, no, md, k, stp, excl, mi, dov, sq, ct] = await Promise.all([
				getLMDispatch(), getLMPalletConfig(),
				getLMDemandAdj(), getLMNomOverrides(),
				getLMManualDemand(), getLMKits(),
				getLMStpDeliveries(), getLMExcluded(),
				getLMManualItems(), getLMDistOverrides(),
				getStockQtyMap(), getAppSetting('lm_cluster_turnaround')
			]);
			dispatchState = disp;
			palletConfig = pc;
			demandAdj = Object.fromEntries((adj || []).map((a: any) => [a.venue_sku, a.adjusted_qty]));
			nomOverrides = Object.fromEntries((no || []).map((o: any) => [o.sku, o]));
			manualDemand = md;
			kits = k;
			stpDeliveries = stp;
			excluded = new Set((excl || []).map((e: any) => e.item_id));
			manualItems = mi;
			distOverrides = Object.fromEntries((dov || []).map((o: any) => [o.route_key, o.rate]));
			stockQtys = sq || {};
			clusterTurnaround = typeof ct === 'number' ? ct : (ct?.value ? Number(ct.value) : 5);
		} catch (e: any) {
			loadError = e?.message || 'Failed to load LM data';
			loading = false;
		}
	});

	// ── Derived data ──
	let nomMap = $derived(Object.fromEntries(noms.map(n => [n.sku, n])));
	let dispatchMap = $derived(Object.fromEntries(dispatchState.map(d => [d.fingerprint, d])));
	let palletCfgMap = $derived(Object.fromEntries(palletConfig.map(p => [p.venue_type, p])));
	let stpMap = $derived(Object.fromEntries(stpDeliveries.map(s => [s.venue, s])));

	// Effective pallet dims (respecting overrides + pallet mode)
	function effPallet(sku: string, venueType: string) {
		const ovr = nomOverrides[sku];
		const nom = nomMap[sku];
		const cfg = palletCfgMap[venueType];
		const mode = cfg?.mode || 'dis';
		const isOverrideSku = cfg?.override_skus?.includes(sku);
		const effectiveMode = isOverrideSku ? (mode === 'dis' ? 'asm' : 'dis') : mode;
		const src = ovr || nom || {};
		if (effectiveMode === 'asm' && (src.pallet_qty_asm || 0) > 0) {
			return { pq: src.pallet_qty_asm, ps: src.pallet_spc_asm };
		}
		return { pq: src.pallet_qty || 0, ps: src.pallet_spc || 0 };
	}

	// Effective demand qty (respecting adjustments)
	function effQty(venue: string, sku: string, origQty: number): number {
		const key = venue + '|' + sku;
		return key in demandAdj ? demandAdj[key] : origQty;
	}

	// Aggregate venue stats
	let venueStats = $derived.by(() => {
		const map = new Map<string, { venue: string; cluster: string; venueType: string; country: string; skus: Set<string>; qty: number; rows: number; pallets: number; bumpInDates: Set<string>; adjCount: number }>();
		for (const d of demand) {
			if (!map.has(d.venue)) map.set(d.venue, { venue: d.venue, cluster: d.venue_cluster || '', venueType: d.venue_type || '', country: guessCountry(d.venue_cluster || ''), skus: new Set(), qty: 0, rows: 0, pallets: 0, bumpInDates: new Set(), adjCount: 0 });
			const v = map.get(d.venue)!;
			const q = effQty(d.venue, d.sku, d.required_qty || 0);
			v.skus.add(d.sku);
			v.qty += q;
			v.rows++;
			if (d.bump_in_date) v.bumpInDates.add(d.bump_in_date);
			const ep = effPallet(d.sku, d.venue_type || '');
			if (ep.pq > 0) v.pallets += (q / ep.pq) * (ep.ps || 0);
			if ((d.venue + '|' + d.sku) in demandAdj) v.adjCount++;
		}
		return [...map.values()].map(v => ({ ...v, skuCount: v.skus.size, earliestBI: [...v.bumpInDates].sort()[0] || '' })).sort((a, b) => (a.earliestBI || '9999').localeCompare(b.earliestBI || '9999'));
	});

	function guessCountry(cluster: string): string {
		const u = (cluster || '').toUpperCase();
		if (['TORONTO', 'VANCOUVER', 'TOR', 'VAN'].some(c => u.includes(c))) return 'can';
		if (['MEXICO', 'GUADALAJARA', 'MONTERREY', 'CDMX', 'GDL', 'MTY'].some(c => u.includes(c))) return 'mex';
		return 'us';
	}

	// Group by cluster
	let clusters = $derived.by(() => {
		const map = new Map<string, { name: string; country: string; venues: typeof venueStats; totalQty: number; totalPlt: number }>();
		for (const v of venueStats) {
			const cl = v.cluster || 'Unclustered';
			if (!map.has(cl)) map.set(cl, { name: cl, country: v.country, venues: [], totalQty: 0, totalPlt: 0 });
			const c = map.get(cl)!;
			c.venues.push(v);
			c.totalQty += v.qty;
			c.totalPlt += v.pallets;
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	// Region-filtered clusters
	let filteredClusters = $derived(
		regionFilter === 'all' ? clusters : clusters.filter(c => c.country === regionFilter)
	);

	// Filtered demand
	let filteredDemand = $derived.by(() => {
		let base = demand;
		if (selectedVenue) base = base.filter(d => d.venue === selectedVenue);
		else if (selectedCluster) base = base.filter(d => (d.venue_cluster || '') === selectedCluster);
		return base;
	});

	// Filtered venues for sidebar + dashboard
	let filteredVenues = $derived(
		venueStats.filter(v => {
			if (searchText && !v.venue.toLowerCase().includes(searchText.toLowerCase())) return false;
			if (regionFilter !== 'all' && v.country !== regionFilter) return false;
			return true;
		})
	);

	// Kit allocation map: "venue|sku" → total kit qty
	let kitAllocMap = $derived.by(() => {
		const m = new Map<string, number>();
		for (const kit of kits) {
			for (const item of (kit.items || [])) {
				const key = kit.venue + '|' + item.sku;
				m.set(key, (m.get(key) || 0) + item.qty);
			}
		}
		return m;
	});

	// Venue CORT/STP flags for sidebar badges
	let venueCortStp = $derived.by(() => {
		const m = new Map<string, { cort: boolean; stp: boolean }>();
		for (const d of demand) {
			if (!m.has(d.venue)) m.set(d.venue, { cort: false, stp: false });
			const v = m.get(d.venue)!;
			const nom = nomMap[d.sku];
			if ((d.sku || '').toUpperCase().includes('CORT') || (nom?.name || '').toUpperCase().includes('CORT')) v.cort = true;
			if ((nom?.source || '').toUpperCase().startsWith('STP')) v.stp = true;
		}
		return m;
	});

	let totalVenues = $derived(filteredVenues.length);
	let totalQty = $derived(filteredVenues.reduce((s, v) => s + v.qty, 0));
	let totalPlt = $derived(filteredVenues.reduce((s, v) => s + v.pallets, 0));

	// Warning badges: items missing pallet data or bump-in dates
	let noPalletItems = $derived(demand.filter(d => {
		const nom = nomMap[d.sku];
		return !nom || !nom.pallet_qty || nom.pallet_qty <= 0;
	}));
	let noBumpInItems = $derived(demand.filter(d => !d.bump_in_date));

	// ── Truck fingerprint (content-based ID) ──
	function truckFP(venue: string, biDate: string, truckIdx: number, items: any[]): string {
		return venue + '|' + biDate + '|' + truckIdx + '|' + items.map(i => i.sku).sort().join(',');
	}

	// ── Build plan for a venue ──
	function buildVenuePlan(venue: string): LMTruckDay[] {
		const vs = vsMap[venue];
		const vDemand = demand.filter(d => d.venue === venue).map(d => {
			const nom = nomMap[d.sku];
			const ep = effPallet(d.sku, d.venue_type || '');
			const q = effQty(d.venue, d.sku, d.required_qty || 0);
			return { sku: d.sku, name: nom?.name || d.sku, qty: q, bumpInDate: d.bump_in_date || '',
				palletQty: ep.pq, palletSpc: ep.ps, source: nom?.source || '' };
		});
		return buildLMPlan(vDemand, {
			truckCapacity: vs?.truck_capacity || 26,
			maxTrucksPerDay: vs?.max_trucks || 2,
			leadTime: vs?.lead_time || 3
		});
	}

	// ── Delivery calendar ──
	let calendarData = $derived.by(() => {
		const dayMap = new Map<string, { date: string; trucks: number; pallets: number; pieces: number; venues: Set<string> }>();
		const targetVenues = selectedCluster ? venueStats.filter(v => v.cluster === selectedCluster) : filteredVenues;
		for (const v of targetVenues) {
			const plan = buildVenuePlan(v.venue);
			for (const day of plan) {
				if (!dayMap.has(day.dispatchDate)) dayMap.set(day.dispatchDate, { date: day.dispatchDate, trucks: 0, pallets: 0, pieces: 0, venues: new Set() });
				const d = dayMap.get(day.dispatchDate)!;
				d.trucks += day.trucks.length;
				d.pallets += day.totalPallets;
				d.pieces += day.totalPieces;
				d.venues.add(v.venue);
			}
		}
		return [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
	});

	// ── Navigation ──
	function selectVenue(venue: string) { selectedVenue = venue; selectedCluster = ''; activeTab = 'demand'; }
	function selectCluster(cluster: string) { selectedCluster = cluster; selectedVenue = ''; activeTab = 'dashboard'; }
	function selectAll() { selectedVenue = ''; selectedCluster = ''; activeTab = 'dashboard'; }

	let vsMap = $derived(Object.fromEntries(venueSettings.map(v => [v.venue, v])));

	// ── Venue Settings ──
	function openTruckDetail(day: any, truck: any) {
		modalDay = day;
		modalTruck = truck;
		showTruckModal = true;
	}

	function openVenueSettings(venue: string) {
		editingVenue = venue;
		const vs = vsMap[venue];
		vsForm = { truck_capacity: vs?.truck_capacity ?? 26, max_trucks: vs?.max_trucks ?? 2, lead_time: vs?.lead_time ?? 3 };
		showVenueSettingsModal = true;
	}
	async function saveVenueSettings() {
		await updateLMVenueSettings(editingVenue, vsForm);
		venueSettings = await getLMVenueSettings();
		showVenueSettingsModal = false;
	}

	// ── Dispatch ──
	async function toggleDispatch(fp: string, dispatched: boolean) {
		await captureUndo();
		await updateLMDispatch(fp, dispatched);
		dispatchState = await getLMDispatch();
	}
	async function setDateOverride(fp: string, date: string) {
		await updateLMDispatch(fp, dispatchMap[fp]?.dispatched || false, date || undefined);
		dispatchState = await getLMDispatch();
	}

	// ── Demand Adjustments ──
	async function setDemandAdj(venue: string, sku: string, newQty: string) {
		await captureUndo();
		const key = venue + '|' + sku;
		const val = parseInt(newQty);
		if (isNaN(val) || val < 0) { await removeLMDemandAdj(key); delete demandAdj[key]; }
		else { await upsertLMDemandAdj(key, val); demandAdj[key] = val; }
		demandAdj = { ...demandAdj };
	}

	// ── Nom Overrides ──
	function openNomOverride(sku: string) {
		nomOvrSku = sku;
		const ovr = nomOverrides[sku] || nomMap[sku] || {};
		nomOvrForm = { pallet_qty: ovr.pallet_qty || 0, pallet_spc: ovr.pallet_spc || 0, pallet_qty_asm: ovr.pallet_qty_asm || 0, pallet_spc_asm: ovr.pallet_spc_asm || 0 };
		showNomOvrModal = true;
	}
	async function saveNomOverride() {
		await upsertLMNomOverride(nomOvrSku, nomOvrForm);
		nomOverrides = { ...nomOverrides, [nomOvrSku]: { sku: nomOvrSku, ...nomOvrForm } };
		showNomOvrModal = false;
	}
	async function clearNomOverride() {
		await removeLMNomOverride(nomOvrSku);
		const { [nomOvrSku]: _, ...rest } = nomOverrides;
		nomOverrides = rest;
		showNomOvrModal = false;
	}

	// ── Manual Demand ──
	function openAddDemand() {
		addDemandForm = { venue: selectedVenue || '', sku: '', name: '', source: '', qty: 0, bumpInDate: '' };
		showAddDemandModal = true;
	}
	async function saveManualDemand() {
		const f = addDemandForm;
		if (!f.venue || !f.sku || !f.qty) return;
		const vStat = venueStats.find(v => v.venue === f.venue);
		await addLMManualDemand({
			sku: f.sku, name: f.name, source: f.source, venue: f.venue,
			qty: f.qty, bump_in_date: f.bumpInDate || undefined,
			cluster: vStat?.cluster || '', venue_type: vStat?.venueType || ''
		});
		manualDemand = await getLMManualDemand();
		// Also insert into demand (reload)
		demand = await getLMDemand();
		showAddDemandModal = false;
	}
	async function deleteManualDemand(id: number) {
		await removeLMManualDemand(id);
		manualDemand = await getLMManualDemand();
		demand = await getLMDemand();
	}

	// ── Kits ──
	function openCreateKit() {
		kitForm = { venue: selectedVenue || '', sku: '', name: '', pallet_qty: 0, pallet_spc: 0, items: [{ sku: '', qty: 0 }] };
		showKitModal = true;
	}
	function addKitItem() { kitForm.items = [...kitForm.items, { sku: '', qty: 0 }]; }
	function removeKitItem(i: number) { kitForm.items = kitForm.items.filter((_, idx) => idx !== i); }
	async function saveKit() {
		if (!kitForm.venue || !kitForm.sku || !kitForm.name) return;
		const items = kitForm.items.filter(i => i.sku && i.qty > 0);
		if (!items.length) return;
		const nextId = kits.length > 0 ? Math.max(...kits.map(k => k.id)) + 1 : 1;
		await addLMKit({ id: nextId, sku: kitForm.sku, name: kitForm.name, venue: kitForm.venue, pallet_qty: kitForm.pallet_qty, pallet_spc: kitForm.pallet_spc }, items);
		kits = await getLMKits();
		showKitModal = false;
	}
	async function deleteKit(id: number) {
		await captureUndo();
		await removeLMKit(id);
		kits = await getLMKits();
	}

	// ── STP Deliveries ──
	function openCreateStp() {
		const nextId = stpDeliveries.length > 0 ? Math.max(...stpDeliveries.map(s => s.id)) + 1 : 1;
		stpForm = { id: nextId, venue: selectedVenue || '', delivery_date: '', rate: 0 };
		showStpModal = true;
	}
	async function saveStp() {
		if (!stpForm.venue) return;
		await upsertLMStpDelivery(stpForm);
		stpDeliveries = await getLMStpDeliveries();
		showStpModal = false;
	}
	async function deleteStp(id: number) {
		await captureUndo();
		await removeLMStpDelivery(id);
		stpDeliveries = await getLMStpDeliveries();
	}

	function exportStpDelivery(stpId: number) {
		const stp = stpDeliveries.find((s: any) => s.id === stpId);
		if (!stp) return;
		const stpItems = demand.filter(d => d.venue === stp.venue && nomMap[d.sku]?.source?.toUpperCase().includes('STP'));
		if (!stpItems.length) return;
		exportLMDemand(stpItems, nomMap);
	}

	// ── Excluded ──
	async function toggleExclude(itemId: string) {
		if (excluded.has(itemId)) {
			await removeLMExcluded(itemId);
			excluded.delete(itemId);
		} else {
			await addLMExcluded(itemId, false);
			excluded.add(itemId);
		}
		excluded = new Set(excluded);
	}

	// ── Pallet Config ──
	async function setPalletMode(venueType: string, mode: 'dis' | 'asm') {
		const existing = palletCfgMap[venueType];
		await updateLMPalletConfig(venueType, mode, existing?.override_skus || []);
		palletConfig = await getLMPalletConfig();
	}

	// ── Cluster Turnaround ──
	async function saveClusterTurnaround(val: number) {
		clusterTurnaround = val;
		await updateAppSetting('lm_cluster_turnaround', val);
	}

	// ── All unique venue names ──
	let allVenueNames = $derived([...new Set(demand.map(d => d.venue))].sort());
	let allVenueTypes = $derived([...new Set(venueStats.map(v => v.venueType).filter(Boolean))].sort());
</script>

{#if loading}
	<Spinner message="Loading Last Mile data..." />
{:else if loadError}
	<div style="padding:40px;text-align:center">
		<div style="font-size:14px;font-weight:700;color:var(--rd);margin-bottom:8px">Failed to load Last Mile</div>
		<div style="font-size:12px;color:var(--ts)">{loadError}</div>
		<button class="rbtn" style="margin-top:12px" onclick={() => window.location.reload()}>🔄 Retry</button>
	</div>
{:else}
	<div style="display:flex;height:calc(100vh - 100px);overflow:hidden">
		<!-- Sidebar -->
		{#if sidebarOpen}
			<div class="sidebar">
				<!-- Search -->
				<div style="padding:8px 10px;border-bottom:1px solid var(--bd)">
					<input type="text" bind:value={searchText} placeholder="Search venue..."
						style="width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:4px;font-size:10px;outline:none;box-sizing:border-box">
				</div>

				<!-- Region filter tabs -->
				<div style="display:flex;border-bottom:1px solid var(--bd)">
					{#each [['all', '🌍 All'], ['us', '🇺🇸'], ['can', '🇨🇦'], ['mex', '🇲🇽']] as [val, label]}
						<button class="region-tab" class:active={regionFilter === val}
							onclick={() => regionFilter = val}>{label}</button>
					{/each}
				</div>

				<!-- All venues -->
				<div class="vi" class:selected={!selectedVenue && !selectedCluster} onclick={selectAll}>
					<div style="font-size:11px;font-weight:700">📊 All Venues</div>
					<div style="font-size:9px;color:var(--tt)">{totalVenues} venues · {totalPlt.toFixed(0)} plt · {totalQty.toLocaleString()} pcs</div>
				</div>

				<!-- Clusters & venues -->
				{#each filteredClusters as cl}
					{@const clVenues = searchText ? cl.venues.filter(v => v.venue.toLowerCase().includes(searchText.toLowerCase())) : cl.venues}
					{#if clVenues.length > 0}
						<div class="vi cluster-header" class:selected={selectedCluster === cl.name && !selectedVenue}
							onclick={() => selectCluster(cl.name)}>
							<div style="font-size:10px;font-weight:700;color:var(--ts)">
								{cl.country === 'can' ? '🇨🇦' : cl.country === 'mex' ? '🇲🇽' : '🇺🇸'} {cl.name}
							</div>
							<div style="font-size:9px;color:var(--tt)">{cl.venues.length}v · {cl.totalPlt.toFixed(0)} plt</div>
						</div>
						{#each clVenues as v}
							{@const csFlags = venueCortStp.get(v.venue)}
							<div class="vi venue-item" class:selected={selectedVenue === v.venue}
								onclick={() => selectVenue(v.venue)}>
								<div style="font-size:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{v.venue}{#if csFlags?.cort} <span style="font-size:7px;background:var(--rs);color:var(--rd);padding:0 3px;border-radius:2px;font-weight:700">CORT</span>{/if}{#if csFlags?.stp} <span style="font-size:7px;background:var(--os);color:var(--or);padding:0 3px;border-radius:2px;font-weight:700">STP</span>{/if}</div>
								<div style="font-size:9px;color:var(--tt)">{v.pallets.toFixed(1)} plt · {v.qty.toLocaleString()} pcs{v.earliestBI ? ' · ' + v.earliestBI : ''}</div>
							</div>
						{/each}
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Main content -->
		<div style="flex:1;overflow-y:auto;padding:16px;padding-bottom:52px">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
				<button onclick={() => sidebarOpen = !sidebarOpen} class="rbtn" style="font-size:10px;padding:3px 8px">
					{sidebarOpen ? '☰' : '☰ Venues'}
				</button>
				<div style="font-size:14px;font-weight:700">
					{selectedVenue || selectedCluster || 'All Venues'}
				</div>
				{#if selectedVenue || selectedCluster}
					<button onclick={selectAll} class="rbtn" style="font-size:9px;padding:2px 6px">✕ Clear</button>
				{/if}
				{#if selectedVenue && isAdmin}
					<button class="rbtn" style="font-size:9px;padding:2px 8px;background:var(--ps);color:var(--pu);border-color:#D4C5FE"
						onclick={() => openVenueSettings(selectedVenue)}>⚙ Settings</button>
				{/if}
			</div>

			<TabBar tabs={lmTabs} active={activeTab} onchange={(id) => activeTab = id} />

			<!-- ════ DASHBOARD ════ -->
			{#if activeTab === 'dashboard'}
				<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
					<Card padding="12px">
						<div style="font-size:9px;color:var(--ts);font-weight:600">VENUES</div>
						<div style="font-size:20px;font-weight:700;color:var(--ac)">{selectedCluster ? clusters.find(c => c.name === selectedCluster)?.venues.length || 0 : totalVenues}</div>
					</Card>
					<Card padding="12px">
						<div style="font-size:9px;color:var(--ts);font-weight:600">PALLETS</div>
						<div style="font-size:20px;font-weight:700;color:var(--pu)">{(selectedCluster ? clusters.find(c => c.name === selectedCluster)?.totalPlt || 0 : totalPlt).toFixed(0)}</div>
					</Card>
					<Card padding="12px">
						<div style="font-size:9px;color:var(--ts);font-weight:600">PIECES</div>
						<div style="font-size:20px;font-weight:700;color:var(--gn)">{(selectedCluster ? clusters.find(c => c.name === selectedCluster)?.totalQty || 0 : totalQty).toLocaleString()}</div>
					</Card>
					<Card padding="12px">
						<div style="font-size:9px;color:var(--ts);font-weight:600">CLUSTERS</div>
						<div style="font-size:20px;font-weight:700">{filteredClusters.length}</div>
					</Card>
				</div>

				{#if noPalletItems.length > 0 || noBumpInItems.length > 0}
					<div style="display:flex;gap:8px;margin-bottom:10px">
						{#if noPalletItems.length > 0}
							<button class="rbtn" style="background:var(--os);color:var(--or);border-color:#F5D6B8;font-size:10px"
								onclick={() => { showNoPalletModal = true }}>
								{noPalletItems.length} items missing pallet data
							</button>
						{/if}
						{#if noBumpInItems.length > 0}
							<button class="rbtn" style="background:var(--rs);color:var(--rd);border-color:#F5B8BA;font-size:10px"
								onclick={() => { showNoBIModal = true }}>
								{noBumpInItems.length} items missing bump-in date
							</button>
						{/if}
					</div>
				{/if}

				{#if isAdmin}
					<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
						<a href="/lm/upload" class="rbtn" style="text-decoration:none;font-size:10px;padding:4px 10px">📂 Upload Files</a>
						<button class="rbtn" style="font-size:10px;padding:4px 10px;background:var(--gs);color:var(--gn);border-color:#B8DFCA" onclick={openAddDemand}>+ Manual Demand</button>
						<button class="rbtn" style="font-size:10px;padding:4px 10px;background:var(--ps);color:var(--pu);border-color:#D4C5FE" onclick={openCreateKit}>📦 Create Kit</button>
						<button class="rbtn" style="font-size:10px;padding:4px 10px;background:var(--os);color:var(--or);border-color:#F5D6B8" onclick={openCreateStp}>🏪 STP Delivery</button>
						<button class="rbtn" style="font-size:10px;padding:4px 10px" onclick={() => showPalletCfgModal = true}>📐 Pallet Config</button>
					</div>
				{/if}

				<!-- Delivery Calendar -->
				{#if calendarData.length > 0}
					<Card>
						<div style="font-size:12px;font-weight:700;margin-bottom:8px">Delivery Calendar</div>
						<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;max-height:180px;overflow-y:auto">
							{#each calendarData as day}
								<div style="padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:10px;background:var(--bg)">
									<div style="font-weight:700;font-family:var(--fm)">{day.date}</div>
									<div style="color:var(--ac)">{day.trucks}t · {day.pallets.toFixed(0)}p</div>
									<div style="color:var(--tt);font-size:8px">{day.venues.size} venues · {day.pieces.toLocaleString()} pcs</div>
								</div>
							{/each}
						</div>
					</Card>
				{/if}

				<!-- Kits summary -->
				{#if kits.length > 0}
					<Card>
						<div style="font-size:12px;font-weight:700;margin-bottom:8px">Kits ({kits.length})</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px">
							{#each kits as kit}
								<div style="padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:10px;background:var(--ps);display:flex;gap:8px;align-items:center">
									<span><b>{kit.sku}</b> — {kit.name} ({kit.venue})</span>
									<span style="color:var(--tt)">{kit.items?.length || 0} items</span>
									{#if isAdmin}<button onclick={() => deleteKit(kit.id)} style="font-size:10px;background:none;border:none;cursor:pointer;color:var(--rd)" title="Delete kit">✕</button>{/if}
								</div>
							{/each}
						</div>
					</Card>
				{/if}

				<!-- STP Deliveries summary -->
				{#if stpDeliveries.length > 0}
					<Card>
						<div style="font-size:12px;font-weight:700;margin-bottom:8px">STP Deliveries ({stpDeliveries.length})</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px">
							{#each stpDeliveries as stp}
								<div style="padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:10px;background:var(--os);display:flex;gap:8px;align-items:center">
									<span><b>{stp.venue}</b> — {stp.delivery_date || '—'}{stp.rate ? ' · $' + stp.rate : ''}</span>
									<button onclick={() => exportStpDelivery(stp.id)} style="font-size:9px;background:none;border:none;cursor:pointer;color:var(--ac)" title="Export STP delivery">⬇</button>
									{#if isAdmin}<button onclick={() => deleteStp(stp.id)} style="font-size:10px;background:none;border:none;cursor:pointer;color:var(--rd)" title="Delete STP">✕</button>{/if}
								</div>
							{/each}
						</div>
					</Card>
				{/if}

				<!-- Venue table -->
				<Card>
					<div style="font-size:12px;font-weight:700;margin-bottom:8px">Venues by Bump-in Date</div>
					<div style="overflow-x:auto;max-height:calc(100vh - 450px);overflow-y:auto">
						<table class="dtb">
							<thead style="position:sticky;top:0;background:var(--sf)">
								<tr><th>Venue</th><th>Cluster</th><th>Type</th><th>SKUs</th><th>Qty</th><th>Pallets</th><th>Earliest BI</th><th>Capacity</th><th>Adj</th></tr>
							</thead>
							<tbody>
								{#each (selectedCluster ? venueStats.filter(v => v.cluster === selectedCluster) : filteredVenues) as v}
									{@const vs = vsMap[v.venue]}
									<tr onclick={() => selectVenue(v.venue)} style="cursor:pointer">
										<td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{v.venue}</td>
										<td style="font-size:10px;color:var(--ts)">{v.cluster || '—'}</td>
										<td style="font-size:10px;color:var(--ts)">{v.venueType || '—'}</td>
										<td class="mono">{v.skuCount}</td>
										<td class="mono fw7">{v.qty.toLocaleString()}</td>
										<td class="mono">{v.pallets.toFixed(1)}</td>
										<td class="mono">{v.earliestBI || '—'}</td>
										<td>{#if vs}<span class="mono" style="font-size:10px">{vs.truck_capacity}p·{vs.max_trucks}t·{vs.lead_time}d</span>{:else}<span style="color:var(--tt)">—</span>{/if}</td>
										<td>{#if v.adjCount > 0}<span style="font-size:9px;color:var(--pu);font-weight:700">★{v.adjCount}</span>{/if}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>

			<!-- ════ DEMAND ════ -->
			{:else if activeTab === 'demand'}
				<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
					<StatBadge label="{filteredDemand.length} rows · {filteredDemand.reduce((s, d) => s + effQty(d.venue, d.sku, d.required_qty || 0), 0).toLocaleString()} pcs" />
					{#if selectedVenue}<StatBadge label="{selectedVenue}" variant="purple" />{/if}
					{#if isAdmin}
						<button class="rbtn" style="font-size:9px;padding:2px 8px;background:var(--gs);color:var(--gn);border-color:#B8DFCA" onclick={openAddDemand}>+ Add</button>
					{/if}
				</div>

				<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 260px);overflow-y:auto">
					<table class="dtb">
						<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
							<tr>
								<th>Venue</th><th>SKU</th><th>Name</th><th>Orig Qty</th>
								{#if isAdmin}<th>Adj Qty</th>{/if}
								<th>Stock</th><th>Bump-in</th><th>Plt</th>
								{#if isAdmin}<th></th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each filteredDemand.slice(0, 1000) as d}
								{@const nom = nomMap[d.sku]}
								{@const adjKey = d.venue + '|' + d.sku}
								{@const hasAdj = adjKey in demandAdj}
								{@const q = effQty(d.venue, d.sku, d.required_qty || 0)}
								{@const ep = effPallet(d.sku, d.venue_type || '')}
								{@const plt = ep.pq > 0 ? (q / ep.pq) * (ep.ps || 0) : 0}
								{@const sq = stockQtys[d.sku]}
								{@const kitQty = kitAllocMap.get(d.venue + '|' + d.sku)}
								{@const isStp = nom?.source?.toUpperCase().startsWith('STP')}
								<tr style="{hasAdj ? 'background:var(--ps)' : ''}{isStp ? ';opacity:0.6' : ''}">
									<td style="font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{d.venue}</td>
									<td class="mono" style="font-size:10px">{d.sku}</td>
									<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{nom?.name || d.sku}{#if isStp} <span style="font-size:8px" title="STP sourced">🏪</span>{/if}{#if kitQty} <span style="font-size:8px;background:var(--ps);color:var(--pu);padding:0 3px;border-radius:2px" title="{kitQty} allocated to kit">📦{kitQty}</span>{/if}</td>
									<td class="mono" style={hasAdj ? 'text-decoration:line-through;color:var(--tt)' : 'font-weight:700'}>{(d.required_qty || 0).toLocaleString()}</td>
									{#if isAdmin}
										<td>
											<input type="number" value={hasAdj ? demandAdj[adjKey] : ''} placeholder={String(d.required_qty || 0)}
												style="width:60px;padding:2px 4px;border:1px solid {hasAdj ? 'var(--pu)' : 'var(--bd)'};border-radius:3px;font-size:10px;font-family:var(--fm);background:{hasAdj ? 'var(--ps)' : 'transparent'}"
												onchange={(e) => setDemandAdj(d.venue, d.sku, (e.target as HTMLInputElement).value)} />
										</td>
									{/if}
									<td class="mono" style="font-size:10px;{sq !== undefined ? (sq > 0 ? 'color:var(--gn);font-weight:700' : 'color:var(--rd)') : 'color:var(--tt)'}">{sq !== undefined ? sq.toLocaleString() : '—'}</td>
									<td class="mono" style="font-size:10px">{d.bump_in_date || '—'}</td>
									<td class="mono" style="font-size:10px">{plt > 0 ? plt.toFixed(2) : '—'}</td>
									{#if isAdmin}
										<td style="white-space:nowrap">
											{#if nomOverrides[d.sku]}<span style="color:var(--pu);font-size:9px" title="Has pallet override">📐</span>{/if}
											<button onclick={() => openNomOverride(d.sku)} style="font-size:9px;background:none;border:none;cursor:pointer;opacity:.5" title="Pallet override">⚙</button>
											{#if d.is_manual}<button onclick={() => deleteManualDemand(d.id)} style="font-size:9px;background:none;border:none;cursor:pointer;color:var(--rd)" title="Remove manual demand">✕</button>{/if}
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
					{#if filteredDemand.length > 1000}
						<div style="padding:8px;text-align:center;font-size:10px;color:var(--tt)">Showing first 1000 of {filteredDemand.length} rows</div>
					{/if}
				</div>

			<!-- ════ TRUCKS ════ -->
			{:else if activeTab === 'trucks'}
				{#if selectedCluster && !selectedVenue}
					<!-- Cluster truck plan -->
					{@const clVenues = clusters.find(c => c.name === selectedCluster)?.venues || []}
					{@const clDemand = demand.filter(d => clVenues.some(v => v.venue === d.venue)).map(d => {
						const nom = nomMap[d.sku];
						const ep = effPallet(d.sku, d.venue_type || '');
						const q = effQty(d.venue, d.sku, d.required_qty || 0);
						return { sku: d.sku, name: nom?.name || d.sku, qty: q, bumpInDate: d.bump_in_date || '',
							palletQty: ep.pq, palletSpc: ep.ps, source: nom?.source || '', venue: d.venue };
					})}
					{@const clPlan = buildLMPlan(clDemand, { truckCapacity: 26, maxTrucksPerDay: 4, leadTime: 3, clusterTurnaround, isCluster: true })}

					<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
						<StatBadge label="Cluster: {selectedCluster}" variant="purple" />
						<StatBadge label="{clVenues.length} venues · {clPlan.reduce((s, d) => s + d.trucks.length, 0)} trucks" />
						{#if isAdmin}
							<span style="font-size:10px;color:var(--ts)">Turnaround:</span>
							<input type="number" value={clusterTurnaround} min="0" max="30" style="width:40px;padding:2px 4px;border:1px solid var(--bd);border-radius:3px;font-size:10px;font-family:var(--fm)"
								onchange={(e) => saveClusterTurnaround(parseInt((e.target as HTMLInputElement).value) || 5)} />
							<span style="font-size:10px;color:var(--tt)">days</span>
						{/if}
					</div>

					{#each clPlan as day}
						<div style="margin-bottom:14px">
							<div class="day-header">
								📅 Dispatch: {day.dispatchDate} → BI: {day.bumpInDate} — {day.trucks.length}t · {day.totalPallets.toFixed(1)} plt
							</div>
							<div style="display:flex;flex-wrap:wrap;gap:10px">
								{#each day.trucks as truck, ti}
									{@const fp = truckFP(selectedCluster, day.bumpInDate, ti, truck.items)}
									{@const disp = dispatchMap[fp]}
									<div class="truck-card" style="cursor:pointer;{disp?.dispatched ? 'border-color:var(--gn)' : truck.isCORT ? 'border-color:var(--or)' : ''}" onclick={() => openTruckDetail(day, truck)}>
										<div style="display:flex;justify-content:space-between;margin-bottom:4px">
											<span style="font-size:13px;font-weight:700;{truck.isCORT ? 'color:var(--rd)' : ''}">{truck.isCORT ? 'CORT' : 'CL-' + (ti + 1)}</span>
											<span class="mono" style="font-size:12px;font-weight:700">{truck.pallets.toFixed(1)} / 26</span>
										</div>
										<ProgressBar value={truck.pallets} max={26} />
										<div style="font-size:9px;color:var(--tt);margin-top:3px">{truck.items.length} SKUs · {truck.pieces.toLocaleString()} pcs</div>
										{#if isAdmin}
											<div style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:9px">
												<label style="display:flex;align-items:center;gap:3px;cursor:pointer">
													<input type="checkbox" checked={disp?.dispatched || false} onchange={(e) => toggleDispatch(fp, (e.target as HTMLInputElement).checked)} />
													{disp?.dispatched ? '✅ Dispatched' : 'Dispatch'}
												</label>
												<input type="number" value={distOverrides[fp] || ''} placeholder="Rate" step="0.01"
													style="width:50px;font-size:9px;padding:1px 3px;border:1px solid var(--bd);border-radius:3px;{distOverrides[fp] ? 'background:var(--ps);border-color:var(--pu)' : ''}"
													onchange={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) { upsertLMDistOverride(fp, v); distOverrides[fp] = v; } else { removeLMDistOverride(fp); delete distOverrides[fp]; } distOverrides = {...distOverrides}; }}
													title="Rate override ($)" />
											</div>
										{/if}
										<div style="margin-top:4px;max-height:120px;overflow-y:auto">
											{#each truck.items.slice(0, 20) as item}
												<div style="display:flex;justify-content:space-between;font-size:8px;padding:1px 0;border-bottom:1px solid var(--bg)">
													<span class="mono">{item.sku}</span>
													<span>{item.qty} · {item.pallets.toFixed(2)}p</span>
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}

				{:else if selectedVenue}
					{@const vs = vsMap[selectedVenue]}
					{@const vStat = venueStats.find(v => v.venue === selectedVenue)}
					{@const plan = buildVenuePlan(selectedVenue)}

					<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
						<StatBadge label="{plan.reduce((s, d) => s + d.trucks.length, 0)} trucks · {plan.length} days" />
						<StatBadge label="{(vStat?.pallets || 0).toFixed(0)} plt total" variant="purple" />
						<StatBadge label="{vs?.truck_capacity || 26}p/{vs?.max_trucks || 2}t/{vs?.lead_time || 3}d" variant="default" />
						{#if isAdmin}
							<button class="rbtn" style="font-size:9px;padding:2px 8px;background:var(--ps);color:var(--pu);border-color:#D4C5FE"
								onclick={() => openVenueSettings(selectedVenue)}>⚙ Settings</button>
						{/if}
					</div>

					{#if plan.length === 0}
						<div class="card" style="text-align:center;padding:30px">
							<div style="font-size:12px;color:var(--ts)">No items with valid bump-in dates and pallet data for this venue.</div>
						</div>
					{:else}
						{#each plan as day}
							<div style="margin-bottom:14px">
								<div class="day-header">
									📅 Dispatch: {day.dispatchDate} → Bump-in: {day.bumpInDate}
									<span style="font-weight:400;color:var(--tt);margin-left:8px">{day.trucks.length} truck{day.trucks.length > 1 ? 's' : ''} · {day.totalPallets.toFixed(1)} plt · {day.totalPieces.toLocaleString()} pcs</span>
								</div>
								<div style="display:flex;flex-wrap:wrap;gap:10px">
									{#each day.trucks as truck, ti}
										{@const fp = truckFP(selectedVenue, day.bumpInDate, ti, truck.items)}
										{@const disp = dispatchMap[fp]}
										<div class="truck-card" style="cursor:pointer;{disp?.dispatched ? 'border-color:var(--gn)' : truck.isCORT ? 'border-color:var(--or)' : ''}" onclick={() => openTruckDetail(day, truck)}>
											<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
												<span style="font-size:13px;font-weight:700;{truck.isCORT ? 'color:var(--rd)' : ''}">{truck.isCORT ? 'CORT' : 'T-' + (ti + 1)}</span>
												<span style="font-size:13px;font-weight:700;font-family:var(--fm)">{truck.pallets.toFixed(1)} <span style="font-size:10px;font-weight:400;color:var(--ts)">/ {vs?.truck_capacity || 26}</span></span>
											</div>
											<ProgressBar value={truck.pallets} max={vs?.truck_capacity || 26} />
											<div style="font-size:10px;color:var(--tt);margin-top:4px">{truck.items.length} SKUs · {truck.pieces.toLocaleString()} pcs</div>
											{#if isAdmin}
												<div style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:9px;flex-wrap:wrap">
													<label style="display:flex;align-items:center;gap:3px;cursor:pointer">
														<input type="checkbox" checked={disp?.dispatched || false} onchange={(e) => toggleDispatch(fp, (e.target as HTMLInputElement).checked)} />
														{disp?.dispatched ? '✅' : 'Dispatch'}
													</label>
													<input type="date" value={disp?.date_override || ''} style="font-size:9px;padding:1px 3px;border:1px solid var(--bd);border-radius:3px;{disp?.date_override ? 'background:var(--os);border-color:var(--or)' : ''}"
														onchange={(e) => setDateOverride(fp, (e.target as HTMLInputElement).value)} title="Override dispatch date" />
													<button onclick={() => toggleExclude(fp)} style="font-size:9px;background:none;border:1px solid var(--bd);border-radius:3px;padding:1px 4px;cursor:pointer;{excluded.has(fp) ? 'background:var(--rs);color:var(--rd)' : ''}"
														title={excluded.has(fp) ? 'Excluded — click to include' : 'Click to exclude'}>{excluded.has(fp) ? '👁‍🗨 Excl' : '👁'}</button>
													<input type="number" value={distOverrides[fp] || ''} placeholder="Rate" step="0.01"
														style="width:50px;font-size:9px;padding:1px 3px;border:1px solid var(--bd);border-radius:3px;{distOverrides[fp] ? 'background:var(--ps);border-color:var(--pu)' : ''}"
														onchange={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) { upsertLMDistOverride(fp, v); distOverrides[fp] = v; } else { removeLMDistOverride(fp); delete distOverrides[fp]; } distOverrides = {...distOverrides}; }}
														title="Rate override ($)" />
												</div>
											{/if}
											<div style="margin-top:6px;max-height:150px;overflow-y:auto">
												{#each truck.items as item}
													<div style="display:flex;justify-content:space-between;font-size:9px;padding:2px 0;border-bottom:1px solid var(--bg)">
														<span class="mono" style="font-weight:600">{item.sku}</span>
														<span>{item.qty.toLocaleString()} pcs · {item.pallets.toFixed(2)} plt</span>
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				{:else}
					<div class="card" style="text-align:center;padding:40px">
						<div style="font-size:32px;margin-bottom:12px">🚛</div>
						<div style="font-size:14px;font-weight:700;margin-bottom:6px">Select a Venue</div>
						<div style="font-size:12px;color:var(--ts)">Select a venue from the sidebar to see the truck loading plan.</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Bottom Bar -->
	<BottomBar>
		{#if activeTab === 'demand' && filteredDemand.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLMDemand(filteredDemand, nomMap)}>⬇ Demand</button>
		{/if}
		{#if activeTab === 'dashboard' && venueStats.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLMVenues(venueStats)}>⬇ Venues</button>
		{/if}
		{#if activeTab === 'trucks' && selectedVenue}
			{@const plan = buildVenuePlan(selectedVenue)}
			{#if plan.length > 0}
				<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
					onclick={() => exportLMTruckPlan(plan, selectedVenue, vsMap[selectedVenue]?.truck_capacity || 26)}>⬇ Trucks</button>
			{/if}
		{/if}
	</BottomBar>

	<!-- ════ MODALS ════ -->

	<!-- Venue Settings Modal -->
	{#if showVenueSettingsModal}
		<Modal title="Venue Settings — {editingVenue}" bind:open={showVenueSettingsModal}>
			<div style="display:grid;gap:12px;font-size:12px">
				<label>Truck Capacity (pallets)
					<input type="number" bind:value={vsForm.truck_capacity} min="1" max="53" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" />
				</label>
				<label>Max Trucks per Day
					<input type="number" bind:value={vsForm.max_trucks} min="1" max="20" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" />
				</label>
				<label>Lead Time (days)
					<input type="number" bind:value={vsForm.lead_time} min="0" max="30" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" />
				</label>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button class="mbtn" onclick={() => showVenueSettingsModal = false}>Cancel</button>
					<button class="mbtn mbtn-primary" onclick={saveVenueSettings}>Save</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Add Manual Demand Modal -->
	{#if showAddDemandModal}
		<Modal title="Add Manual Demand" bind:open={showAddDemandModal}>
			<div style="display:grid;gap:10px;font-size:12px">
				<label>Venue
					<select bind:value={addDemandForm.venue} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box">
						<option value="">Select venue...</option>
						{#each allVenueNames as vn}<option value={vn}>{vn}</option>{/each}
					</select>
				</label>
				<label>SKU <input type="text" bind:value={addDemandForm.sku} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				<label>Name <input type="text" bind:value={addDemandForm.name} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
					<label>Qty <input type="number" bind:value={addDemandForm.qty} min="1" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
					<label>Bump-in Date <input type="date" bind:value={addDemandForm.bumpInDate} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				</div>
				<label>Source <input type="text" bind:value={addDemandForm.source} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button class="mbtn" onclick={() => showAddDemandModal = false}>Cancel</button>
					<button class="mbtn" style="background:#43A047;color:#fff;border-color:#388E3C" onclick={saveManualDemand}>Create</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Kit Modal -->
	{#if showKitModal}
		<Modal title="Create Kit" bind:open={showKitModal}>
			<div style="display:grid;gap:10px;font-size:12px">
				<label>Venue
					<select bind:value={kitForm.venue} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box">
						<option value="">Select venue...</option>
						{#each allVenueNames as vn}<option value={vn}>{vn}</option>{/each}
					</select>
				</label>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
					<label>Kit SKU <input type="text" bind:value={kitForm.sku} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
					<label>Kit Name <input type="text" bind:value={kitForm.name} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
					<label>Pallet Qty <input type="number" bind:value={kitForm.pallet_qty} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
					<label>Pallet Spc <input type="number" bind:value={kitForm.pallet_spc} step="0.1" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				</div>
				<div style="font-weight:700;margin-top:4px">Kit Items</div>
				{#each kitForm.items as item, i}
					<div style="display:flex;gap:6px;align-items:center">
						<input type="text" bind:value={item.sku} placeholder="SKU" style="flex:2;padding:6px;border:1px solid var(--bd);border-radius:4px;font-size:11px" />
						<input type="number" bind:value={item.qty} placeholder="Qty" min="1" style="flex:1;padding:6px;border:1px solid var(--bd);border-radius:4px;font-size:11px" />
						<button onclick={() => removeKitItem(i)} style="font-size:12px;background:none;border:none;cursor:pointer;color:var(--rd)">✕</button>
					</div>
				{/each}
				<button onclick={addKitItem} class="rbtn" style="font-size:10px;padding:3px 8px;width:fit-content">+ Add Item</button>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button class="mbtn" onclick={() => showKitModal = false}>Cancel</button>
					<button class="mbtn" style="background:var(--pu);color:#fff;border-color:var(--pu)" onclick={saveKit}>Create Kit</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- STP Delivery Modal -->
	{#if showStpModal}
		<Modal title="STP Delivery" bind:open={showStpModal}>
			<div style="display:grid;gap:10px;font-size:12px">
				<label>Venue
					<select bind:value={stpForm.venue} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box">
						<option value="">Select venue...</option>
						{#each allVenueNames as vn}<option value={vn}>{vn}</option>{/each}
					</select>
				</label>
				<label>Delivery Date <input type="date" bind:value={stpForm.delivery_date} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				<label>Rate ($/unit) <input type="number" bind:value={stpForm.rate} step="0.01" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					<button class="mbtn" onclick={() => showStpModal = false}>Cancel</button>
					<button class="mbtn" style="background:#EF6C00;color:#fff;border-color:#E65100" onclick={saveStp}>Create STP</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Nom Override Modal -->
	{#if showNomOvrModal}
		<Modal title="Pallet Override — {nomOvrSku}" bind:open={showNomOvrModal}>
			<div style="display:grid;gap:10px;font-size:12px">
				<div style="font-size:11px;color:var(--ts);font-weight:600">Disassembled</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
					<label>Pallet Qty <input type="number" bind:value={nomOvrForm.pallet_qty} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
					<label>Pallet Spc <input type="number" bind:value={nomOvrForm.pallet_spc} step="0.1" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				</div>
				<div style="font-size:11px;color:var(--ts);font-weight:600;margin-top:6px">Assembled</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
					<label>Pallet Qty <input type="number" bind:value={nomOvrForm.pallet_qty_asm} style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
					<label>Pallet Spc <input type="number" bind:value={nomOvrForm.pallet_spc_asm} step="0.1" style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:6px;font-size:12px;margin-top:4px;box-sizing:border-box" /></label>
				</div>
				<div style="display:flex;gap:8px;justify-content:flex-end">
					{#if nomOverrides[nomOvrSku]}<button class="mbtn mbtn-danger" onclick={clearNomOverride}>Clear Override</button>{/if}
					<button class="mbtn" onclick={() => showNomOvrModal = false}>Cancel</button>
					<button class="mbtn mbtn-primary" onclick={saveNomOverride}>Save</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Pallet Config Modal -->
	{#if showPalletCfgModal}
		<Modal title="Pallet Configuration" bind:open={showPalletCfgModal}>
			<div style="font-size:12px">
				<p style="color:var(--ts);margin-bottom:12px">Set pallet mode (disassembled/assembled) per venue type.</p>
				{#each allVenueTypes as vt}
					{@const cfg = palletCfgMap[vt]}
					<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)">
						<span style="font-weight:600;min-width:120px">{vt}</span>
						<button class="rbtn" style="font-size:10px;padding:3px 10px;{(!cfg || cfg.mode === 'dis') ? 'background:var(--as);color:var(--ac);border-color:var(--ab)' : ''}" onclick={() => setPalletMode(vt, 'dis')}>Disassembled</button>
						<button class="rbtn" style="font-size:10px;padding:3px 10px;{cfg?.mode === 'asm' ? 'background:var(--ps);color:var(--pu);border-color:#D4C5FE' : ''}" onclick={() => setPalletMode(vt, 'asm')}>Assembled</button>
					</div>
				{/each}
				{#if allVenueTypes.length === 0}
					<div style="color:var(--tt);text-align:center;padding:20px">No venue types found. Upload demand data first.</div>
				{/if}
				<div style="display:flex;justify-content:flex-end;margin-top:12px">
					<button class="mbtn" onclick={() => showPalletCfgModal = false}>Close</button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Truck Detail Modal -->
	{#if showTruckModal && modalTruck}
		<Modal title="{modalTruck.isCORT ? 'CORT' : 'Truck'} — {modalDay?.dispatchDate} → {modalDay?.bumpInDate}" bind:open={showTruckModal}>
			<div style="font-size:12px">
				<div style="display:flex;gap:12px;margin-bottom:12px">
					<div><span style="color:var(--ts)">Pallets:</span> <b>{modalTruck.pallets.toFixed(1)}</b></div>
					<div><span style="color:var(--ts)">Pieces:</span> <b>{modalTruck.pieces.toLocaleString()}</b></div>
					<div><span style="color:var(--ts)">SKUs:</span> <b>{modalTruck.items.length}</b></div>
				</div>
				<table class="dtb">
					<thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Pallets</th></tr></thead>
					<tbody>
						{#each modalTruck.items as item}
							{@const nom = nomMap[item.sku]}
							{@const sq = stockQtys[item.sku]}
							<tr>
								<td class="mono" style="font-size:10px">{item.sku}</td>
								<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{nom?.name || item.name || item.sku}</td>
								<td class="mono fw7">{item.qty.toLocaleString()}</td>
								<td class="mono">{item.pallets.toFixed(2)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Modal>
	{/if}

	<!-- No Pallet Data Modal -->
	<Modal title="Items Missing Pallet Data" subtitle="{noPalletItems.length} items" bind:open={showNoPalletModal} maxWidth="600px">
		<div style="overflow-y:auto;max-height:400px;border:1px solid var(--bd);border-radius:var(--r)">
			<table class="dtb">
				<thead style="position:sticky;top:0;background:var(--sf)">
					<tr><th>SKU</th><th>Name</th><th>Venue</th></tr>
				</thead>
				<tbody>
					{#each noPalletItems as item}
						<tr>
							<td class="mono" style="font-weight:600;font-size:10px">{item.sku}</td>
							<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">{nomMap[item.sku]?.name || item.sku}</td>
							<td style="font-size:10px;color:var(--ts)">{item.venue || '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Modal>

	<!-- No Bump-in Date Modal -->
	<Modal title="Items Missing Bump-in Date" subtitle="{noBumpInItems.length} items" bind:open={showNoBIModal} maxWidth="600px">
		<div style="overflow-y:auto;max-height:400px;border:1px solid var(--bd);border-radius:var(--r)">
			<table class="dtb">
				<thead style="position:sticky;top:0;background:var(--sf)">
					<tr><th>Venue</th><th>SKU</th><th>Name</th><th>Qty</th></tr>
				</thead>
				<tbody>
					{#each noBumpInItems as item}
						<tr>
							<td style="font-size:10px;color:var(--ts)">{item.venue || '—'}</td>
							<td class="mono" style="font-weight:600;font-size:10px">{item.sku}</td>
							<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">{nomMap[item.sku]?.name || item.sku}</td>
							<td class="mono fw7" style="font-size:11px">{(item.required_qty || 0).toLocaleString()}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Modal>
{/if}

<!-- Mobile bottom nav -->
<nav class="lm-mobile-nav">
	<button class="lm-nav-btn" class:active={sidebarOpen} onclick={() => { sidebarOpen = !sidebarOpen; }}>
		<span class="lm-nav-icon">&#9776;</span> Venues
	</button>
	<button class="lm-nav-btn" class:active={activeTab === 'dashboard' && !sidebarOpen} onclick={() => { activeTab = 'dashboard'; sidebarOpen = false; }}>
		<span class="lm-nav-icon">&#128202;</span> Dashboard
	</button>
	<button class="lm-nav-btn" class:active={activeTab === 'trucks' && !sidebarOpen} onclick={() => { activeTab = 'trucks'; sidebarOpen = false; }}>
		<span class="lm-nav-icon">&#128667;</span> Trucks
	</button>
</nav>

<style>
	.sidebar { width:260px; flex-shrink:0; border-right:1px solid var(--bd); overflow-y:auto; background:var(--sf); }
	.vi { padding: 6px 12px; cursor: pointer; border-left: 3px solid transparent; transition: all .12s; }
	.vi:hover { background: #FAFBFC; }
	.vi.selected { background: var(--as); border-left-color: var(--ac); }
	.cluster-header { background: var(--bg); border-left-color: transparent; }
	.cluster-header.selected { background: var(--as); border-left-color: var(--ac); }
	.venue-item { padding-left: 20px; }
	.region-tab { flex:1; padding:6px 0; font-size:11px; border:none; background:transparent; cursor:pointer; color:var(--ts); border-bottom:2px solid transparent; }
	.region-tab.active { color:var(--ac); border-bottom-color:var(--ac); font-weight:700; }
	.day-header { font-size:11px; font-weight:700; color:var(--ts); margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid var(--bd); }
	.truck-card { background:var(--sf); border:1px solid var(--bd); border-radius:var(--r); padding:12px; min-width:220px; max-width:280px; }

	/* Mobile bottom nav — hidden on desktop */
	.lm-mobile-nav {
		display: none;
		position: fixed; bottom: 0; left: 0; right: 0;
		height: 52px; z-index: 80;
		background: var(--sf); border-top: 1px solid var(--bd);
		justify-content: space-around; align-items: center;
		padding: 0 4px;
	}
	.lm-nav-btn {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 2px; border: none; background: transparent; cursor: pointer;
		color: var(--ts); font-size: 10px; font-family: var(--fd); font-weight: 600;
		padding: 4px 0; transition: color .12s;
	}
	.lm-nav-btn:hover, .lm-nav-btn.active { color: var(--ac); }
	.lm-nav-icon { font-size: 18px; line-height: 1; }

	@media (max-width: 768px) {
		.sidebar { position:fixed; left:0; top:48px; bottom:52px; z-index:50; box-shadow:4px 0 12px rgba(0,0,0,.1); }
		.lm-mobile-nav { display: flex; }
	}
</style>
