<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, subtitle = '', open = $bindable(false), maxWidth = '600px', children }: {
		title: string; subtitle?: string; open: boolean; maxWidth?: string; children: Snippet;
	} = $props();

	function close() { open = false; }
	function onOverlayClick(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
</script>

{#if open}
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box" style="max-width:{maxWidth}">
			<div class="modal-header">
				<div>
					<div class="modal-title">{title}</div>
					{#if subtitle}<div class="modal-subtitle">{subtitle}</div>{/if}
				</div>
				<button class="modal-close" onclick={close}>✕</button>
			</div>
			<div class="modal-body">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 999; }
	.modal-box { background: var(--sf); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.2); width: 92vw; max-height: 85vh; display: flex; flex-direction: column; }
	.modal-header { padding: 16px 20px; border-bottom: 1px solid var(--bd); display: flex; align-items: center; justify-content: space-between; }
	.modal-title { font-size: 16px; font-weight: 700; }
	.modal-subtitle { font-size: 11px; color: var(--ts); margin-top: 2px; }
	.modal-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--tt); width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
	.modal-close:hover { background: var(--bg); }
	.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
</style>
