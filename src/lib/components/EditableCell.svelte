<script lang="ts">
	let { value, type = 'text', placeholder = '', width = '60px', isAdmin = false, onsave, confirmed = false }: {
		value: string | number; type?: 'text' | 'number'; placeholder?: string; width?: string;
		isAdmin?: boolean; onsave: (val: string) => void; confirmed?: boolean;
	} = $props();
</script>

{#if isAdmin}
	<input {type} {value} {placeholder}
		step={type === 'number' ? '0.01' : undefined}
		onchange={(e) => onsave(e.currentTarget.value)}
		onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
		style="width:{width};font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid {confirmed ? 'var(--gn)' : 'var(--bd)'};border-radius:4px;outline:none;background:{confirmed ? 'var(--gs)' : 'var(--sf)'}">
{:else}
	<span class="mono">{value || '—'}</span>
{/if}
