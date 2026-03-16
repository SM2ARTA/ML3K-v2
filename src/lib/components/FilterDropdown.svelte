<script lang="ts">
	let { label, items, selected = $bindable(new Set<string>()), allLabel = 'All' }: {
		label: string; items: string[]; selected: Set<string>; allLabel?: string;
	} = $props();

	let open = $state(false);
	let allSelected = $derived(selected.size === 0 || selected.size === items.length);
	let displayLabel = $derived(allSelected ? `${allLabel} ${label}` : `${selected.size} ${label}`);

	function toggle(item: string) {
		const next = new Set(selected);
		if (next.has(item)) next.delete(item); else next.add(item);
		selected = next;
	}
	function selectAll(all: boolean) {
		selected = all ? new Set(items) : new Set();
	}
	function onClickOutside(e: MouseEvent) {
		if (open && !(e.target as HTMLElement)?.closest('.filter-dd')) open = false;
	}
</script>

<svelte:document onclick={onClickOutside} />

<div class="filter-dd" style="position:relative">
	<button class="rbtn" onclick={() => open = !open}>{displayLabel} ▾</button>
	{#if open}
		<div class="dd-panel">
			<div class="dd-actions">
				<button onclick={() => selectAll(true)} class="dd-btn dd-btn-all">All</button>
				<button onclick={() => selectAll(false)} class="dd-btn dd-btn-none">None</button>
			</div>
			{#each items as item}
				<label class="dd-item">
					<input type="checkbox" checked={allSelected || selected.has(item)} onchange={() => toggle(item)}>
					{item}
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.dd-panel { position: absolute; top: 34px; left: 0; z-index: 90; background: var(--sf); border: 1px solid var(--bd); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.1); padding: 6px; min-width: 160px; max-height: 260px; overflow-y: auto; }
	.dd-actions { display: flex; gap: 4px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid var(--bd); }
	.dd-btn { font-size: 9px; padding: 2px 6px; border: 1px solid var(--bd); border-radius: 3px; cursor: pointer; }
	.dd-btn-all { background: var(--gs); color: var(--gn); }
	.dd-btn-none { background: var(--rs); color: var(--rd); }
	.dd-item { display: flex; align-items: center; gap: 5px; padding: 3px 4px; font-size: 10px; cursor: pointer; border-radius: 3px; }
	.dd-item:hover { background: var(--bg); }
</style>
