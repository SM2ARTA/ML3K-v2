<script lang="ts">
	let { label, variant = 'default' }: { label: string; variant?: 'default' | 'green' | 'orange' | 'purple' | 'red' } = $props();
	const styles: Record<string, string> = {
		default: 'background:var(--bg);color:var(--ts)',
		green: 'background:var(--gs);color:var(--gn)',
		orange: 'background:var(--os);color:var(--or)',
		purple: 'background:var(--ps);color:var(--pu)',
		red: 'background:var(--rs);color:var(--rd)'
	};
</script>

<span class="stat-badge" style={styles[variant]}>{label}</span>

<style>
	.stat-badge { font-size: 11px; padding: 4px 10px; border-radius: 4px; font-weight: 600; white-space: nowrap; }
</style>
