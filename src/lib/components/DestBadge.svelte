<script lang="ts">
	import { destColor, cleanDest, destAbbr } from '$lib/utils';

	let { dest, qty, isHeld = false, compact = false, showQty = true }: {
		dest: string; qty: number; isHeld?: boolean; compact?: boolean; showQty?: boolean;
	} = $props();

	let dc = $derived(destColor(dest));
	let displayName = $derived(compact ? destAbbr(dest) : cleanDest(dest));
</script>

<span class="dest-badge" class:held={isHeld}
	style="background:{dc.bg};color:{dc.color};border-color:{dc.border}">
	{displayName}{showQty ? ' ' + qty.toLocaleString() : ''}
</span>

<style>
	.dest-badge {
		display: inline-block; padding: 1px 6px; margin: 1px; border-radius: 4px;
		font-size: 9px; font-weight: 600; border: 1px solid; white-space: nowrap;
	}
	.held { opacity: .3; text-decoration: line-through; }
</style>
