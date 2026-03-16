<script lang="ts">
	import { onMount } from 'svelte';
	import { getLMNomenclature, getLMDemand, getLMVenueSettings } from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, SearchInput, Card, ProgressBar, TruckCard, BottomBar } from '$lib/components';
	import { buildLMPlan, type LMTruckDay } from '$lib/lm-engine';
	import { exportLMDemand, exportLMVenues } from '$lib/exports';

	let noms = $state<any[]>([]);
	let demand = $state<any[]>([]);
	let venueSettings = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state('dashboard');
	let searchText = $state('');
	let selectedVenue = $state('');
	let selectedCluster = $state('');
	let sidebarOpen = $state(true);

	const lmTabs = [
		{ id: 'dashboard', label: '📊 Dashboard' },
		{ id: 'demand', label: '📋 Demand' },
		{ id: 'trucks', label: '🚛 Trucks' }
	];

	onMount(async () => {
		const [n, d, v] = await Promise.all([getLMNomenclature(), getLMDemand(), getLMVenueSettings()]);
		noms = n; demand = d; venueSettings = v;
		loading = false;
	});

	// Nomenclature map
	let nomMap = $derived(Object.fromEntries(noms.map(n => [n.sku, n])));

	// Aggregate demand by venue
	let venueStats = $derived.by(() => {
		const map = new Map<string, { venue: string; cluster: string; venueType: string; skus: Set<string>; qty: number; rows: number; pallets: number; bumpInDates: Set<string> }>();
		for (const d of demand) {
			if (!map.has(d.venue)) map.set(d.venue, { venue: d.venue, cluster: d.venue_cluster || '', venueType: d.venue_type || '', skus: new Set(), qty: 0, rows: 0, pallets: 0, bumpInDates: new Set() });
			const v = map.get(d.venue)!;
			v.skus.add(d.sku);
			v.qty += d.required_qty || 0;
			v.rows++;
			if (d.bump_in_date) v.bumpInDates.add(d.bump_in_date);
			// Calculate pallets
			const nom = nomMap[d.sku];
			if (nom && nom.pallet_qty > 0) v.pallets += ((d.required_qty || 0) / nom.pallet_qty) * (nom.pallet_spc || 0);
		}
		return [...map.values()].map(v => ({ ...v, skuCount: v.skus.size, earliestBI: [...v.bumpInDates].sort()[0] || '' })).sort((a, b) => (a.earliestBI || '9999').localeCompare(b.earliestBI || '9999'));
	});

	// Group by cluster
	let clusters = $derived.by(() => {
		const map = new Map<string, { name: string; venues: typeof venueStats; totalQty: number; totalPlt: number }>();
		for (const v of venueStats) {
			const cl = v.cluster || 'Unclustered';
			if (!map.has(cl)) map.set(cl, { name: cl, venues: [], totalQty: 0, totalPlt: 0 });
			const c = map.get(cl)!;
			c.venues.push(v);
			c.totalQty += v.qty;
			c.totalPlt += v.pallets;
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	// Filtered demand for selected venue/cluster
	let filteredDemand = $derived.by(() => {
		if (selectedVenue) return demand.filter(d => d.venue === selectedVenue);
		if (selectedCluster) return demand.filter(d => (d.venue_cluster || '') === selectedCluster);
		return demand;
	});

	// Filtered venues
	let filteredVenues = $derived(
		venueStats.filter(v => !searchText || v.venue.toLowerCase().includes(searchText.toLowerCase()))
	);

	let totalVenues = $derived(venueStats.length);
	let totalQty = $derived(demand.reduce((s, d) => s + (d.required_qty || 0), 0));
	let totalPlt = $derived(venueStats.reduce((s, v) => s + v.pallets, 0));

	function selectVenue(venue: string) {
		selectedVenue = venue;
		selectedCluster = '';
		activeTab = 'demand';
	}

	function selectCluster(cluster: string) {
		selectedCluster = cluster;
		selectedVenue = '';
		activeTab = 'dashboard';
	}

	function selectAll() {
		selectedVenue = '';
		selectedCluster = '';
		activeTab = 'dashboard';
	}

	// Venue settings map
	let vsMap = $derived(Object.fromEntries(venueSettings.map(v => [v.venue, v])));
</script>

{#if loading}
	<Spinner message="Loading Last Mile data..." />
{:else}
	<div style="display:flex;height:calc(100vh - 100px);overflow:hidden">
		<!-- Sidebar -->
		{#if sidebarOpen}
			<div style="width:260px;flex-shrink:0;border-right:1px solid var(--bd);overflow-y:auto;background:var(--sf)">
				<!-- Search -->
				<div style="padding:8px 10px;border-bottom:1px solid var(--bd)">
					<input type="text" bind:value={searchText} placeholder="Search venue..."
						style="width:100%;padding:6px 8px;border:1px solid var(--bd);border-radius:4px;font-size:10px;outline:none;box-sizing:border-box">
				</div>

				<!-- All venues -->
				<div class="vi" class:selected={!selectedVenue && !selectedCluster} onclick={selectAll}>
					<div style="font-size:11px;font-weight:700">📊 All Venues</div>
					<div style="font-size:9px;color:var(--tt)">{totalVenues} venues · {totalPlt.toFixed(0)} plt · {totalQty.toLocaleString()} pcs</div>
				</div>

				<!-- Clusters & venues -->
				{#each clusters as cl}
					{@const clVenues = searchText ? cl.venues.filter(v => v.venue.toLowerCase().includes(searchText.toLowerCase())) : cl.venues}
					{#if clVenues.length > 0}
						<div class="vi cluster-header" class:selected={selectedCluster === cl.name && !selectedVenue}
							onclick={() => selectCluster(cl.name)}>
							<div style="font-size:10px;font-weight:700;color:var(--ts)">{cl.name}</div>
							<div style="font-size:9px;color:var(--tt)">{cl.venues.length}v · {cl.totalPlt.toFixed(0)} plt</div>
						</div>
						{#each clVenues as v}
							<div class="vi venue-item" class:selected={selectedVenue === v.venue}
								onclick={() => selectVenue(v.venue)}>
								<div style="font-size:10px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{v.venue}</div>
								<div style="font-size:9px;color:var(--tt)">{v.pallets.toFixed(1)} plt · {v.qty.toLocaleString()} pcs{v.earliestBI ? ' · ' + v.earliestBI : ''}</div>
							</div>
						{/each}
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Main content -->
		<div style="flex:1;overflow-y:auto;padding:16px">
			<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
				<button onclick={() => sidebarOpen = !sidebarOpen} class="rbtn" style="font-size:10px;padding:3px 8px">
					{sidebarOpen ? '☰' : '☰ Venues'}
				</button>
				<div style="font-size:14px;font-weight:700">
					{selectedVenue || selectedCluster || 'All Venues'}
				</div>
				{#if selectedVenue || selectedCluster}
					<button onclick={selectAll} style="font-size:9px;color:var(--ts);background:none;border:1px solid var(--bd);border-radius:4px;padding:2px 6px;cursor:pointer">✕ Clear</button>
				{/if}
			</div>

			<TabBar tabs={lmTabs} active={activeTab} onchange={(id) => activeTab = id} />

			{#if activeTab === 'dashboard'}
				<!-- Dashboard -->
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
						<div style="font-size:20px;font-weight:700">{clusters.length}</div>
					</Card>
				</div>

				{#if isAdmin}
					<div style="margin-bottom:12px">
						<a href="/lm/upload" class="rbtn" style="text-decoration:none;font-size:10px;padding:4px 10px">📂 Upload Files</a>
					</div>
				{/if}

				<!-- Venue table -->
				<Card>
					<div style="font-size:12px;font-weight:700;margin-bottom:8px">Venues by Bump-in Date</div>
					<div style="overflow-x:auto;max-height:calc(100vh - 350px);overflow-y:auto">
						<table class="dtb">
							<thead style="position:sticky;top:0;background:var(--sf)">
								<tr><th>Venue</th><th>Cluster</th><th>Type</th><th>SKUs</th><th>Qty</th><th>Pallets</th><th>Earliest BI</th><th>Capacity</th></tr>
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
										<td>{#if vs}<span class="mono" style="font-size:10px">{vs.truck_capacity} plt · {vs.max_trucks}t · {vs.lead_time}d</span>{:else}<span style="color:var(--tt)">—</span>{/if}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>

			{:else if activeTab === 'demand'}
				<!-- Demand -->
				<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
					<StatBadge label="{filteredDemand.length} rows · {filteredDemand.reduce((s, d) => s + (d.required_qty || 0), 0).toLocaleString()} pcs" />
					{#if selectedVenue}<StatBadge label="{selectedVenue}" variant="purple" />{/if}
				</div>

				<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 260px);overflow-y:auto">
					<table class="dtb">
						<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
							<tr><th>Venue</th><th>SKU</th><th>Name</th><th>Qty</th><th>Bump-in</th><th>Cluster</th><th>Type</th></tr>
						</thead>
						<tbody>
							{#each filteredDemand.slice(0, 1000) as d}
								{@const nom = nomMap[d.sku]}
								<tr>
									<td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{d.venue}</td>
									<td class="mono">{d.sku}</td>
									<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{nom?.name || d.sku}</td>
									<td class="mono fw7">{(d.required_qty || 0).toLocaleString()}</td>
									<td class="mono" style="font-size:10px">{d.bump_in_date || '—'}</td>
									<td style="font-size:10px;color:var(--ts)">{d.venue_cluster || '—'}</td>
									<td style="font-size:10px;color:var(--ts)">{d.venue_type || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if filteredDemand.length > 1000}
						<div style="padding:8px;text-align:center;font-size:10px;color:var(--tt)">Showing first 1000 of {filteredDemand.length} rows</div>
					{/if}
				</div>

			{:else if activeTab === 'trucks'}
				{#if selectedCluster && !selectedVenue}
					<!-- Cluster truck plan -->
					{@const clVenues = clusters.find(c => c.name === selectedCluster)?.venues || []}
					{@const clDemand = demand.filter(d => clVenues.some(v => v.venue === d.venue)).map(d => {
						const nom = nomMap[d.sku];
						return { sku: d.sku, name: nom?.name || d.sku, qty: d.required_qty || 0, bumpInDate: d.bump_in_date || '',
							palletQty: nom?.pallet_qty || 0, palletSpc: nom?.pallet_spc || 0,
							palletQtyAsm: nom?.pallet_qty_asm || 0, palletSpcAsm: nom?.pallet_spc_asm || 0,
							source: nom?.source || '', venue: d.venue };
					})}
					{@const clPlan = buildLMPlan(clDemand, { truckCapacity: 26, maxTrucksPerDay: 4, leadTime: 3, clusterTurnaround: 5, isCluster: true })}

					<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
						<StatBadge label="Cluster: {selectedCluster}" variant="purple" />
						<StatBadge label="{clVenues.length} venues · {clPlan.reduce((s, d) => s + d.trucks.length, 0)} trucks" />
					</div>

					{#each clPlan as day}
						<div style="margin-bottom:14px">
							<div style="font-size:11px;font-weight:700;color:var(--ts);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--bd)">
								📅 Dispatch: {day.dispatchDate} → BI: {day.bumpInDate} — {day.trucks.length}t · {day.totalPallets.toFixed(1)} plt
							</div>
							<div style="display:flex;flex-wrap:wrap;gap:10px">
								{#each day.trucks as truck, ti}
									<Card padding="12px">
										<div style="display:flex;justify-content:space-between;margin-bottom:4px">
											<span style="font-size:13px;font-weight:700;{truck.isCORT ? 'color:var(--rd)' : ''}">{truck.isCORT ? 'CORT' : 'CL-' + (ti + 1)}</span>
											<span class="mono" style="font-size:12px;font-weight:700">{truck.pallets.toFixed(1)} / 26</span>
										</div>
										<ProgressBar value={truck.pallets} max={26} />
										<div style="font-size:9px;color:var(--tt);margin-top:3px">{truck.items.length} SKUs · {truck.pieces.toLocaleString()} pcs</div>
										<div style="margin-top:4px;max-height:120px;overflow-y:auto">
											{#each truck.items.slice(0, 20) as item}
												<div style="display:flex;justify-content:space-between;font-size:8px;padding:1px 0;border-bottom:1px solid var(--bg)">
													<span class="mono">{item.sku}</span>
													<span>{item.qty} · {item.pallets.toFixed(2)}p</span>
												</div>
											{/each}
										</div>
									</Card>
								{/each}
							</div>
						</div>
					{/each}

				{:else if selectedVenue}
					{@const vs = vsMap[selectedVenue]}
					{@const vStat = venueStats.find(v => v.venue === selectedVenue)}
					{@const venueDemand = filteredDemand.map(d => {
						const nom = nomMap[d.sku];
						return { sku: d.sku, name: nom?.name || d.sku, qty: d.required_qty || 0, bumpInDate: d.bump_in_date || '',
							palletQty: nom?.pallet_qty || 0, palletSpc: nom?.pallet_spc || 0 };
					})}
					{@const plan = buildLMPlan(venueDemand, {
						truckCapacity: vs?.truck_capacity || 26,
						maxTrucksPerDay: vs?.max_trucks || 2,
						leadTime: vs?.lead_time || 3
					})}

					<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
						<StatBadge label="{plan.reduce((s, d) => s + d.trucks.length, 0)} trucks · {plan.length} days" />
						<StatBadge label="{(vStat?.pallets || 0).toFixed(0)} plt total" variant="purple" />
						<StatBadge label="{vs?.truck_capacity || 26} plt/truck · {vs?.lead_time || 3}d lead" variant="default" />
					</div>

					{#if plan.length === 0}
						<div class="card" style="text-align:center;padding:30px">
							<div style="font-size:12px;color:var(--ts)">No items with valid bump-in dates and pallet data for this venue.</div>
						</div>
					{:else}
						{#each plan as day}
							<div style="margin-bottom:14px">
								<div style="font-size:11px;font-weight:700;color:var(--ts);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--bd)">
									📅 Dispatch: {day.dispatchDate} → Bump-in: {day.bumpInDate}
									<span style="font-weight:400;color:var(--tt);margin-left:8px">{day.trucks.length} truck{day.trucks.length > 1 ? 's' : ''} · {day.totalPallets.toFixed(1)} plt · {day.totalPieces.toLocaleString()} pcs</span>
								</div>
								<div style="display:flex;flex-wrap:wrap;gap:10px">
									{#each day.trucks as truck, ti}
										<Card padding="12px">
											<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
												<span style="font-size:13px;font-weight:700;{truck.isCORT ? 'color:var(--rd)' : ''}">{truck.isCORT ? 'CORT' : 'T-' + (ti + 1)}</span>
												<span style="font-size:13px;font-weight:700;font-family:var(--fm)">{truck.pallets.toFixed(1)} <span style="font-size:10px;font-weight:400;color:var(--ts)">/ {vs?.truck_capacity || 26}</span></span>
											</div>
											<ProgressBar value={truck.pallets} max={vs?.truck_capacity || 26} />
											<div style="font-size:10px;color:var(--tt);margin-top:4px">{truck.items.length} SKUs · {truck.pieces.toLocaleString()} pcs</div>
											<div style="margin-top:6px;max-height:150px;overflow-y:auto">
												{#each truck.items as item}
													<div style="display:flex;justify-content:space-between;font-size:9px;padding:2px 0;border-bottom:1px solid var(--bg)">
														<span class="mono" style="font-weight:600">{item.sku}</span>
														<span>{item.qty.toLocaleString()} pcs · {item.pallets.toFixed(2)} plt</span>
													</div>
												{/each}
											</div>
										</Card>
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
				onclick={() => exportLMDemand(filteredDemand, nomMap)}>⬇ Export Demand</button>
		{/if}
		{#if activeTab === 'dashboard' && venueStats.length}
			<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
				onclick={() => exportLMVenues(venueStats)}>⬇ Export Venues</button>
		{/if}
	</BottomBar>
{/if}

<style>
	.vi { padding: 6px 12px; cursor: pointer; border-left: 3px solid transparent; transition: all .12s; }
	.vi:hover { background: #FAFBFC; }
	.vi.selected { background: var(--as); border-left-color: var(--ac); }
	.cluster-header { background: var(--bg); border-left-color: transparent; }
	.cluster-header.selected { background: var(--as); border-left-color: var(--ac); }
	.venue-item { padding-left: 20px; }
</style>
