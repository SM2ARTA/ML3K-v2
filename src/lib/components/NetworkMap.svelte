<script lang="ts">
	/** Simple network visualization — Dallas hub to 8 destinations */
	import { destColor } from '$lib/utils';

	let { destinations }: { destinations: { dest: string; trucks: number; pallets: number; qty: number; dispatched: number }[] } = $props();

	// Layout: Dallas in center, destinations arranged around it
	const positions: Record<string, { x: number; y: number }> = {
		'Houston': { x: 220, y: 280 },
		'Kansas City': { x: 180, y: 80 },
		'New York New Jersey': { x: 480, y: 60 },
		'Toronto': { x: 420, y: 20 },
		'Vancouver': { x: 80, y: 20 },
		'Mexico City': { x: 160, y: 340 },
		'Guadalajara': { x: 60, y: 280 },
		'Monterrey': { x: 120, y: 240 },
	};
	const dallas = { x: 280, y: 180 };

	function getPos(dest: string) {
		return positions[dest] || { x: 300, y: 200 };
	}

	function abbr(dest: string): string {
		const map: Record<string, string> = {
			'Houston': 'HOU', 'Kansas City': 'KC', 'New York New Jersey': 'NY',
			'Toronto': 'TOR', 'Vancouver': 'VAN', 'Mexico City': 'CDMX',
			'Guadalajara': 'GDL', 'Monterrey': 'MTY'
		};
		return map[dest] || dest.slice(0, 3).toUpperCase();
	}

	let svgEl: SVGSVGElement;

	function downloadSVG() {
		if (!svgEl) return;
		const data = new XMLSerializer().serializeToString(svgEl);
		const blob = new Blob([data], { type: 'image/svg+xml' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'FWC26_Network_Map.svg';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function downloadPNG() {
		if (!svgEl) return;
		const data = new XMLSerializer().serializeToString(svgEl);
		const canvas = document.createElement('canvas');
		canvas.width = 1920; canvas.height = 1240;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const img = new Image();
		img.onload = () => {
			ctx.drawImage(img, 0, 0, 1920, 1240);
			canvas.toBlob(b => {
				if (!b) return;
				const a = document.createElement('a');
				a.href = URL.createObjectURL(b);
				a.download = 'FWC26_Network_Map.png';
				a.click();
				URL.revokeObjectURL(a.href);
			}, 'image/png');
		};
		img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
	}
</script>

<div style="display:flex;gap:6px;margin-bottom:6px">
	<button class="rbtn" onclick={downloadSVG} style="font-size:10px;padding:4px 10px">⬇ SVG</button>
	<button class="rbtn" onclick={downloadPNG} style="font-size:10px;padding:4px 10px">⬇ PNG</button>
</div>
<svg bind:this={svgEl} viewBox="0 0 560 380" style="width:100%;max-width:560px;height:auto" xmlns="http://www.w3.org/2000/svg">
	<!-- Lines from Dallas to destinations -->
	{#each destinations as d}
		{@const pos = getPos(d.dest)}
		{@const dc = destColor(d.dest)}
		<line x1={dallas.x} y1={dallas.y} x2={pos.x} y2={pos.y}
			stroke={dc.color} stroke-width={Math.max(1, Math.min(d.trucks, 8))} opacity="0.3" />
	{/each}

	<!-- Dallas hub -->
	<circle cx={dallas.x} cy={dallas.y} r="18" fill="var(--ac)" opacity="0.9" />
	<text x={dallas.x} y={dallas.y + 4} text-anchor="middle" style="font-size:9px;fill:#fff;font-weight:700">DAL</text>

	<!-- Destination nodes -->
	{#each destinations as d}
		{@const pos = getPos(d.dest)}
		{@const dc = destColor(d.dest)}
		{@const r = Math.max(12, Math.min(d.pallets / 5, 30))}
		<circle cx={pos.x} cy={pos.y} r={r} fill={dc.bg} stroke={dc.color} stroke-width="2" opacity="0.9" />
		<text x={pos.x} y={pos.y - 2} text-anchor="middle" style="font-size:8px;fill:{dc.color};font-weight:700">{abbr(d.dest)}</text>
		<text x={pos.x} y={pos.y + 8} text-anchor="middle" style="font-size:7px;fill:var(--ts)">{d.trucks}t · {d.pallets.toFixed(0)}p</text>
		{#if d.dispatched > 0}
			<circle cx={pos.x + r - 2} cy={pos.y - r + 2} r="5" fill="var(--gn)" />
			<text x={pos.x + r - 2} y={pos.y - r + 5} text-anchor="middle" style="font-size:6px;fill:#fff;font-weight:700">{d.dispatched}</text>
		{/if}
	{/each}
</svg>
