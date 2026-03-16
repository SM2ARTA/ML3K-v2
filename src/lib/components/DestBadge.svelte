<script lang="ts">
	let { dest, qty, isHeld = false, compact = false }: { dest: string; qty: number; isHeld?: boolean; compact?: boolean } = $props();
	let displayName = $derived(dest.replace(/\s*\/\s*(CORT|RIC)\s*$/i, ''));
	let shortName = $derived(compact ? displayName.split(' ').map(w => w.slice(0, 3)).join(' ') : displayName);
</script>

<span class="dest-badge" class:held={isHeld}>
	{shortName} {qty.toLocaleString()}
</span>

<style>
	.dest-badge {
		display: inline-block; padding: 1px 5px; margin: 1px; border-radius: 4px;
		font-size: 8px; font-weight: 600; background: var(--bg); color: var(--ts);
		border: 1px solid var(--bd); white-space: nowrap;
	}
	.held { opacity: .3; text-decoration: line-through; }
</style>
