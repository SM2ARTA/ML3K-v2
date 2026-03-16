<script lang="ts">
	import { DEST_GROUPS } from '$lib/utils';

	let { sources, destinations, holds, isAdmin = false, onHold, onRelease }: {
		sources: string[]; destinations: string[]; holds: any[];
		isAdmin?: boolean;
		onHold: (src: string, dest: string | null) => void;
		onRelease: (src: string, dest: string | null) => void;
	} = $props();

	let selectedSource = $state('');
	let selectedDest = $state('');

	// Count holds per destination for selected source
	let holdStats = $derived.by(() => {
		if (!selectedSource) return {};
		const stats: Record<string, { total: number; held: number }> = {};
		// This is simplified — in production we'd need demand data to count totals
		for (const h of holds) {
			const d = h.destination;
			if (!stats[d]) stats[d] = { total: 0, held: 0 };
			stats[d].held++;
		}
		return stats;
	});
</script>

{#if isAdmin}
	<div class="hold-bar">
		<span style="font-size:11px;font-weight:600;color:var(--ts);white-space:nowrap">⏸ Hold by source:</span>

		<select bind:value={selectedSource} style="font-size:11px;padding:3px 6px;border:1px solid var(--bd);border-radius:4px;font-family:var(--fd)">
			<option value="">-- Source --</option>
			{#each sources as src}
				<option value={src}>{src}</option>
			{/each}
		</select>

		<select bind:value={selectedDest} style="font-size:11px;padding:3px 6px;border:1px solid var(--bd);border-radius:4px;font-family:var(--fd)">
			<option value="">All Destinations</option>
			{#each destinations as dest}
				<option value={dest}>{dest}</option>
			{/each}
		</select>

		<button class="rbtn" style="font-size:10px;padding:3px 8px;background:#FEF3EB;color:#C4550A;border-color:#F5D6B8"
			onclick={() => { if (selectedSource) onHold(selectedSource, selectedDest || null) }}>
			⏸ Hold
		</button>
		<button class="rbtn" style="font-size:10px;padding:3px 8px;background:var(--gs);color:var(--gn);border-color:#B8DFCA"
			onclick={() => { if (selectedSource) onRelease(selectedSource, selectedDest || null) }}>
			▶ Release
		</button>

		<div style="flex:1"></div>

		<!-- Country quick select buttons for destinations filter -->
		<div style="display:flex;gap:3px">
			{#each [['🇨🇦 CAN', 'can'], ['🇲🇽 MEX', 'mex'], ['🇺🇸 USA', 'usa']] as [label, region]}
				<button class="rbtn" style="font-size:9px;padding:2px 6px"
					onclick={() => {
						const dests = DEST_GROUPS[region as keyof typeof DEST_GROUPS] || [];
						selectedDest = dests[0] || '';
					}}>
					{label}
				</button>
			{/each}
		</div>
	</div>

	{#if selectedSource && holds.length > 0}
		<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding:0 12px 8px">
			<span style="font-size:9px;color:var(--ts)">Holds:</span>
			{#each [...new Set(holds.map(h => h.destination))].sort() as dest}
				{@const count = holds.filter(h => h.destination === dest).length}
				{@const allHeld = count > 5}
				<span style="font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;
					background:{allHeld ? '#FEF3EB' : 'var(--gs)'};
					color:{allHeld ? '#C4550A' : 'var(--gn)'};
					border:1px solid {allHeld ? '#F5D6B8' : '#B8DFCA'}">
					{allHeld ? '⏸' : '▶'} {dest.split(' ').map(w => w.slice(0,3)).join(' ')} {count}
				</span>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.hold-bar {
		display: flex; gap: 8px; align-items: center; padding: 8px 12px;
		background: var(--sf); border: 1px solid var(--bd); border-radius: 6px;
		margin-bottom: 8px; flex-wrap: wrap;
	}
</style>
