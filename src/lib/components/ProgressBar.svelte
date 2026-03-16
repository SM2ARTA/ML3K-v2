<script lang="ts">
	let { value, max, showLabel = true }: { value: number; max: number; showLabel?: boolean } = $props();
	let pct = $derived(max > 0 ? Math.min((value / max) * 100, 100) : 0);
	let color = $derived(pct > 95 ? 'var(--rd)' : pct > 80 ? 'var(--or)' : 'var(--ac)');
</script>

<div class="pb-wrap">
	<div class="pb-track">
		<div class="pb-fill" style="width:{pct}%;background:{color}"></div>
	</div>
	{#if showLabel}
		<span class="pb-label" style="color:{color}">{value.toFixed(1)}/{max}</span>
	{/if}
</div>

<style>
	.pb-wrap { display: flex; align-items: center; gap: 6px; }
	.pb-track { flex: 1; height: 7px; background: #F0F1F3; border-radius: 4px; overflow: hidden; }
	.pb-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
	.pb-label { font-size: 11px; font-weight: 600; min-width: 50px; text-align: right; font-family: var(--fm); }
</style>
