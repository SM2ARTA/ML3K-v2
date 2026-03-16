<script lang="ts">
	let { size = 32, message = '' }: { size?: number; message?: string } = $props();
</script>

<div class="spinner-wrap">
	<div class="spn" style="width:{size}px;height:{size}px"></div>
	{#if message}<div class="spinner-msg">{message}</div>{/if}
</div>

<style>
	.spinner-wrap { text-align: center; padding: 40px; }
	.spinner-msg { font-size: 12px; color: var(--ts); margin-top: 12px; }
</style>
