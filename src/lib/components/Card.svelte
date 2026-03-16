<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, padding = '16px' }: { children: Snippet; padding?: string } = $props();
</script>

<div class="card" style="padding:{padding}">
	{@render children()}
</div>
