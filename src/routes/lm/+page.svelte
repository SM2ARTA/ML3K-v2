<script lang="ts">
	import { onMount } from 'svelte';
	import { getLMNomenclature, getLMDemand, getLMVenueSettings } from '$lib/db';
	import { role } from '$lib/stores';
	import { TabBar, StatBadge, Spinner, SearchInput, Card } from '$lib/components';

	let noms = $state<any[]>([]);
	let demand = $state<any[]>([]);
	let venues = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state('dashboard');
	let searchText = $state('');
	let selectedVenue = $state('');

	const lmTabs = [
		{ id: 'dashboard', label: '📊 Dashboard' },
		{ id: 'demand', label: '📋 Demand' },
		{ id: 'venues', label: '🏟️ Venues' }
	];

	onMount(async () => {
		const [n, d, v] = await Promise.all([getLMNomenclature(), getLMDemand(), getLMVenueSettings()]);
		noms = n; demand = d; venues = v;
		loading = false;
	});

	// Aggregate demand by venue
	let venueStats = $derived.by(() => {
		const map = new Map<string, { venue: string; skus: Set<string>; qty: number; rows: number }>();
		for (const d of demand) {
			if (!map.has(d.venue)) map.set(d.venue, { venue: d.venue, skus: new Set(), qty: 0, rows: 0 });
			const v = map.get(d.venue)!;
			v.skus.add(d.sku);
			v.qty += d.required_qty || 0;
			v.rows++;
		}
		return [...map.values()]
			.map(v => ({ ...v, skuCount: v.skus.size }))
			.sort((a, b) => b.qty - a.qty);
	});

	let filteredVenues = $derived(
		venueStats.filter(v => !searchText || v.venue.toLowerCase().includes(searchText.toLowerCase()))
	);

	let totalVenues = $derived(venueStats.length);
	let totalQty = $derived(demand.reduce((s, d) => s + (d.required_qty || 0), 0));
	let totalSkus = $derived(noms.length);
</script>

<TabBar tabs={lmTabs} active={activeTab} onchange={(id) => activeTab = id} />

{#if loading}
	<Spinner message="Loading Last Mile data..." />
{:else if activeTab === 'dashboard'}
	<!-- Dashboard -->
	<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
		<Card>
			<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">🏟️ VENUES</div>
			<div style="font-size:24px;font-weight:700;color:var(--ac)">{totalVenues}</div>
			<div style="font-size:10px;color:var(--ts)">{venues.length} with settings</div>
		</Card>
		<Card>
			<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📦 TOTAL PIECES</div>
			<div style="font-size:24px;font-weight:700;color:var(--gn)">{totalQty.toLocaleString()}</div>
			<div style="font-size:10px;color:var(--ts)">{demand.length} demand rows</div>
		</Card>
		<Card>
			<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📋 SKUs</div>
			<div style="font-size:24px;font-weight:700;color:var(--pu)">{totalSkus}</div>
			<div style="font-size:10px;color:var(--ts)">in nomenclature</div>
		</Card>
	</div>

	<!-- Top venues -->
	<Card>
		<div style="font-size:14px;font-weight:700;margin-bottom:12px">Top Venues by Quantity</div>
		<table class="dtb">
			<thead><tr><th>Venue</th><th>SKUs</th><th>Total Qty</th><th>Rows</th></tr></thead>
			<tbody>
				{#each venueStats.slice(0, 20) as v}
					<tr>
						<td style="font-weight:600">{v.venue}</td>
						<td class="mono">{v.skuCount}</td>
						<td class="mono fw7">{v.qty.toLocaleString()}</td>
						<td class="mono" style="color:var(--ts)">{v.rows}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Card>

{:else if activeTab === 'demand'}
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
		<StatBadge label="{demand.length} rows · {totalQty.toLocaleString()} pcs" />
		<SearchInput bind:value={searchText} placeholder="Search venue..." />
	</div>

	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);max-height:calc(100vh - 200px);overflow-y:auto">
		<table class="dtb">
			<thead style="position:sticky;top:0;background:var(--sf);z-index:10">
				<tr><th>Venue</th><th>SKU</th><th>Qty</th><th>Bump-in</th><th>Cluster</th><th>Type</th></tr>
			</thead>
			<tbody>
				{#each demand.filter(d => !searchText || d.venue?.toLowerCase().includes(searchText.toLowerCase()) || d.sku?.toLowerCase().includes(searchText.toLowerCase())).slice(0, 500) as d}
					<tr>
						<td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{d.venue}</td>
						<td class="mono">{d.sku}</td>
						<td class="mono fw7">{(d.required_qty || 0).toLocaleString()}</td>
						<td class="mono" style="font-size:10px">{d.bump_in_date || '—'}</td>
						<td style="font-size:10px;color:var(--ts)">{d.venue_cluster || '—'}</td>
						<td style="font-size:10px;color:var(--ts)">{d.venue_type || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

{:else if activeTab === 'venues'}
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
		<StatBadge label="{venues.length} venues with settings" />
		<SearchInput bind:value={searchText} placeholder="Search venue..." />
	</div>

	<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
		{#each venues.filter(v => !searchText || v.venue.toLowerCase().includes(searchText.toLowerCase())) as v}
			<Card padding="12px">
				<div style="font-size:12px;font-weight:700;margin-bottom:4px">{v.venue}</div>
				<div style="font-size:10px;color:var(--ts);display:grid;grid-template-columns:1fr 1fr;gap:2px">
					<span>Capacity: <b>{v.truck_capacity} plt</b></span>
					<span>Max trucks: <b>{v.max_trucks}</b></span>
					<span>Lead time: <b>{v.lead_time}d</b></span>
					{#if v.bump_in_date}<span>Bump-in: <b>{v.bump_in_date}</b></span>{/if}
				</div>
			</Card>
		{/each}
	</div>
{/if}
