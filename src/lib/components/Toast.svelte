<script lang="ts">
	/** Global toast notification system */
	let toasts = $state<{ id: number; message: string; type: 'success' | 'error' | 'info'; timeout: number }[]>([]);
	let nextId = 0;

	export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
		const id = nextId++;
		toasts = [...toasts, { id, message, type, timeout: duration }];
		setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, duration);
	}

	// Export for global access
	if (typeof window !== 'undefined') {
		(window as any).__toast = showToast;
	}
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}" onclick={() => toasts = toasts.filter(t => t.id !== toast.id)}>
				{#if toast.type === 'success'}✓{:else if toast.type === 'error'}✗{:else}ℹ{/if}
				{toast.message}
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container { position: fixed; bottom: 56px; right: 16px; z-index: 999; display: flex; flex-direction: column; gap: 6px; }
	.toast { padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; animation: slideIn .3s ease; box-shadow: 0 4px 12px rgba(0,0,0,.15); max-width: 320px; }
	.toast-success { background: var(--gs); color: var(--gn); border: 1px solid #B8DFCA; }
	.toast-error { background: var(--rs); color: var(--rd); border: 1px solid #F5C6CB; }
	.toast-info { background: var(--bg); color: var(--ts); border: 1px solid var(--bd); }
	@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
</style>
