<script lang="ts">
	let { confirmed, visible = true, ontoggle }: { confirmed: boolean; visible?: boolean; ontoggle: () => void } = $props();
</script>

{#if visible}
	<button class="confirm-btn" class:confirmed onclick={ontoggle}
		title={confirmed ? 'Confirmed — click to unconfirm' : 'Click to confirm'}>
		{confirmed ? '✓' : '○'}
	</button>
{/if}

<style>
	.confirm-btn { cursor: pointer; font-size: 10px; border: none; background: none; color: var(--tt); opacity: .5; transition: all .15s; }
	.confirm-btn:hover { opacity: 1; }
	.confirm-btn.confirmed { color: var(--gn); opacity: 1; }
</style>
