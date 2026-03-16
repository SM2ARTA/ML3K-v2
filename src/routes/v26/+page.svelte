<script lang="ts">
	import { onMount } from 'svelte';
	import { getSystemStats, getLPTruckSummary, getLPDestinations } from '$lib/db';
	import { StatBadge, Spinner, Card, ProgressBar, DispatchChart, BottomBar, NetworkMap } from '$lib/components';
	import { exportV26Summary } from '$lib/exports';
	import { destColor } from '$lib/utils';

	let stats = $state<any>(null);
	let trucks = $state<any[]>([]);
	let destinations = $state<any[]>([]);
	let loading = $state(true);

	onMount(async () => {
		const [s, t, d] = await Promise.all([getSystemStats(), getLPTruckSummary(), getLPDestinations()]);
		stats = s; trucks = t; destinations = d;
		loading = false;
	});

	// Aggregate by destination
	let destSummary = $derived.by(() => {
		const map = new Map<string, { dest: string; trucks: number; pallets: number; qty: number; dispatched: number }>();
		for (const t of trucks) {
			if (!map.has(t.destination)) map.set(t.destination, { dest: t.destination, trucks: 0, pallets: 0, qty: 0, dispatched: 0 });
			const d = map.get(t.destination)!;
			d.trucks++;
			d.pallets += t.total_pallets || 0;
			d.qty += t.total_qty || 0;
			if (t.dispatched) d.dispatched++;
		}
		return [...map.values()].sort((a, b) => b.pallets - a.pallets);
	});

	let totalTrucks = $derived(trucks.length);
	let totalDispatched = $derived(trucks.filter(t => t.dispatched).length);
	let totalPallets = $derived(trucks.reduce((s, t) => s + (t.total_pallets || 0), 0));
	let totalQty = $derived(trucks.reduce((s, t) => s + (t.total_qty || 0), 0));

	// Dispatch timeline — group trucks by date
	let timeline = $derived.by(() => {
		const map = new Map<string, { date: string; trucks: number; pallets: number; qty: number; dispatched: number }>();
		for (const t of trucks) {
			const d = t.dispatch_date || 'No date';
			if (!map.has(d)) map.set(d, { date: d, trucks: 0, pallets: 0, qty: 0, dispatched: 0 });
			const day = map.get(d)!;
			day.trucks++;
			day.pallets += t.total_pallets || 0;
			day.qty += t.total_qty || 0;
			if (t.dispatched) day.dispatched++;
		}
		return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
	});
</script>

{#if loading}
	<Spinner message="Loading Vision 2026 dashboard..." />
{:else}
	<div style="max-width:1200px;margin:0 auto">
		<!-- KPI Row -->
		<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
			<Card>
				<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📦 LP TRUCKS</div>
				<div style="font-size:24px;font-weight:700;color:var(--ac)">{totalTrucks}</div>
				<div style="font-size:10px;color:var(--ts)">{totalDispatched} dispatched</div>
			</Card>
			<Card>
				<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📐 PALLETS</div>
				<div style="font-size:24px;font-weight:700;color:var(--pu)">{totalPallets.toFixed(0)}</div>
				<div style="font-size:10px;color:var(--ts)">{(totalPallets / Math.max(totalTrucks, 1)).toFixed(1)} avg/truck</div>
			</Card>
			<Card>
				<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📦 PIECES</div>
				<div style="font-size:24px;font-weight:700;color:var(--gn)">{totalQty.toLocaleString()}</div>
				<div style="font-size:10px;color:var(--ts)">{stats?.lp?.skus || 0} SKUs</div>
			</Card>
			<Card>
				<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:4px">📋 CUSTOMS</div>
				<div style="font-size:24px;font-weight:700;color:var(--or)">{stats?.lp?.customsOverrides || 0}</div>
				<div style="font-size:10px;color:var(--ts)">{stats?.lp?.holds || 0} holds active</div>
			</Card>
		</div>

		<!-- Dispatch Volume Chart -->
		{#if timeline.length > 0}
			<Card>
				<div style="font-size:14px;font-weight:700;margin-bottom:8px">📊 Dispatch Volume</div>
				<DispatchChart data={timeline} />
			</Card>
		{/if}

		<!-- Network Map -->
		{#if destSummary.length > 0}
			<Card>
				<div style="font-size:14px;font-weight:700;margin-bottom:8px">🌐 Network</div>
				<NetworkMap destinations={destSummary} />
			</Card>
		{/if}

		<!-- Destination Breakdown -->
		<Card>
			<div style="font-size:14px;font-weight:700;margin-bottom:12px">🌍 Dispatch by Destination</div>
			<div style="display:grid;gap:10px">
				{#each destSummary as d}
					{@const dc = destColor(d.dest)}
					<div style="display:flex;align-items:center;gap:12px">
						<span style="min-width:140px;font-size:12px;font-weight:600;color:{dc.color}">{d.dest}</span>
						<div style="flex:1">
							<ProgressBar value={d.pallets} max={totalPallets} showLabel={false} />
						</div>
						<span class="mono" style="font-size:11px;min-width:60px;text-align:right;font-weight:600">{d.pallets.toFixed(0)} plt</span>
						<span style="font-size:10px;color:var(--ts);min-width:70px">{d.trucks} trucks</span>
						<span style="font-size:10px;color:var(--ts);min-width:80px">{d.qty.toLocaleString()} pcs</span>
						{#if d.dispatched > 0}
							<span style="font-size:9px;color:var(--gn);background:var(--gs);padding:1px 5px;border-radius:3px">🔒 {d.dispatched}</span>
						{/if}
					</div>
				{/each}
			</div>
		</Card>

		<!-- Dispatch Timeline -->
		{#if timeline.length > 0}
			<Card>
				<div style="font-size:14px;font-weight:700;margin-bottom:12px">📅 Dispatch Timeline</div>
				<div style="overflow-x:auto;max-height:300px;overflow-y:auto">
					<table class="dtb">
						<thead style="position:sticky;top:0;background:var(--sf)">
							<tr><th>Date</th><th>Trucks</th><th>Pallets</th><th>Pieces</th><th>Dispatched</th></tr>
						</thead>
						<tbody>
							{#each timeline as day}
								<tr>
									<td class="mono" style="font-weight:600">{day.date}</td>
									<td class="mono">{day.trucks}</td>
									<td class="mono">{day.pallets.toFixed(1)}</td>
									<td class="mono">{day.qty.toLocaleString()}</td>
									<td>
										{#if day.dispatched > 0}
											<span style="font-size:9px;color:var(--gn);background:var(--gs);padding:1px 5px;border-radius:3px">🔒 {day.dispatched}</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}

		<!-- Module Stats -->
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
			<Card>
				<div style="font-size:12px;font-weight:700;margin-bottom:8px">📦 Load Plan</div>
				<div style="font-size:11px;color:var(--ts);display:grid;gap:4px">
					<div>SKUs: <b>{stats?.lp?.skus || 0}</b></div>
					<div>Demand rows: <b>{stats?.lp?.demandRows || 0}</b></div>
					<div>Plan rows: <b>{stats?.lp?.planRows || 0}</b></div>
					<div>Destinations: <b>{destinations.length}</b></div>
				</div>
			</Card>
			<Card>
				<div style="font-size:12px;font-weight:700;margin-bottom:8px">🚛 Last Mile</div>
				<div style="font-size:11px;color:var(--ts);display:grid;gap:4px">
					<div>SKUs: <b>{stats?.lm?.skus || 0}</b></div>
					<div>Demand rows: <b>{stats?.lm?.demandRows || 0}</b></div>
					<div>Venues: <b>{stats?.lm?.venues || 0}</b></div>
					<div>Stock SKUs: <b>{stats?.stock?.skus || 0}</b></div>
				</div>
			</Card>
		</div>
	</div>

	<BottomBar>
		<button class="rbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)"
			onclick={() => exportV26Summary(destSummary, timeline, stats)}>⬇ Export V26</button>
	</BottomBar>
{/if}
