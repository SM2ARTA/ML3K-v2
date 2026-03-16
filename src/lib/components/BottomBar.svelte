<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="bottom-bar">
	{@render children()}
	<div style="flex:1"></div>
	<span style="font-size:9px;color:var(--tt);white-space:nowrap">©2026 Vladislav Abramov | <span style="font-weight:600">SM²ARTA™</span></span>
</div>
