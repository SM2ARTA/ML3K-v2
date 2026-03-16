<script lang="ts">
	let { value = $bindable(''), placeholder = 'Search...', maxWidth = '400px' }: { value: string; placeholder?: string; maxWidth?: string } = $props();
</script>

<input type="text" bind:value {placeholder}
	style="width:100%;max-width:{maxWidth};padding:7px 12px;border:1px solid var(--bd);border-radius:6px;font-size:11px;font-family:var(--fd);outline:none"
>
