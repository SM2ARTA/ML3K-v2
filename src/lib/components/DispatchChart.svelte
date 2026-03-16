<script lang="ts">
	/** Simple bar chart for dispatch volume — no external chart library needed */
	let { data }: { data: { date: string; trucks: number; pallets: number; qty: number; dispatched: number }[] } = $props();

	let maxPlt = $derived(Math.max(...data.map(d => d.pallets), 1));
	let chartWidth = $derived(Math.max(data.length * 36, 400));
</script>

{#if data.length > 0}
	<div style="overflow-x:auto;padding:8px 0">
		<svg width={chartWidth} height="200" style="display:block">
			<!-- Y-axis labels -->
			<text x="0" y="15" style="font-size:9px;fill:var(--tt)">{maxPlt.toFixed(0)} plt</text>
			<text x="0" y="100" style="font-size:9px;fill:var(--tt)">{(maxPlt/2).toFixed(0)}</text>
			<text x="0" y="185" style="font-size:9px;fill:var(--tt)">0</text>
			<line x1="30" y1="0" x2="30" y2="180" stroke="var(--bd)" stroke-width="1" />
			<line x1="30" y1="180" x2={chartWidth} y2="180" stroke="var(--bd)" stroke-width="1" />

			{#each data as d, i}
				{@const x = 36 + i * 32}
				{@const h = (d.pallets / maxPlt) * 160}
				{@const dispH = (d.dispatched / Math.max(d.trucks, 1)) * h}
				<!-- Bar -->
				<rect x={x} y={180 - h} width="24" height={h} rx="2"
					fill={d.dispatched === d.trucks ? 'var(--gn)' : d.dispatched > 0 ? '#F59E0B' : 'var(--ac)'}
					opacity="0.7" />
				<!-- Dispatched portion -->
				{#if dispH > 0 && dispH < h}
					<rect x={x} y={180 - dispH} width="24" height={dispH} rx="0"
						fill="var(--gn)" opacity="0.5" />
				{/if}
				<!-- Truck count label -->
				<text x={x + 12} y={180 - h - 4} text-anchor="middle" style="font-size:8px;fill:var(--tp);font-weight:600">{d.trucks}</text>
				<!-- Date label -->
				<text x={x + 12} y="195" text-anchor="middle" style="font-size:7px;fill:var(--tt)" transform="rotate(-45,{x + 12},195)">
					{d.date.slice(5)}
				</text>
			{/each}
		</svg>
	</div>
	<!-- Legend -->
	<div style="display:flex;gap:12px;font-size:9px;color:var(--ts);margin-top:4px">
		<span><span style="display:inline-block;width:10px;height:10px;background:var(--ac);opacity:.7;border-radius:2px;vertical-align:middle"></span> Pending</span>
		<span><span style="display:inline-block;width:10px;height:10px;background:#F59E0B;opacity:.7;border-radius:2px;vertical-align:middle"></span> Partial</span>
		<span><span style="display:inline-block;width:10px;height:10px;background:var(--gn);opacity:.7;border-radius:2px;vertical-align:middle"></span> Dispatched</span>
	</div>
{/if}
