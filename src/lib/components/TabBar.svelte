<script lang="ts">
	type Tab = { id: string; label: string };
	let { tabs, active, onchange }: { tabs: Tab[]; active: string; onchange: (id: string) => void } = $props();
</script>

<div class="tab-bar">
	{#each tabs as tab}
		<button class="rbtn" class:active={active === tab.id} onclick={() => onchange(tab.id)}>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tab-bar { display: flex; gap: 2px; padding: 6px 0; margin-bottom: 12px; border-bottom: 1px solid var(--bd); }
	.tab-bar .active { background: var(--as); color: var(--ac); border-color: var(--ab); }
</style>
