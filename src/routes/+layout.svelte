<script lang="ts">
	import '../app.css';
	import { role, activeModule, connected } from '$lib/stores';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(async () => {
		try {
			const { data, error } = await supabase.from('shared_state').select('id').limit(1);
			if (!error) $connected = true;
		} catch {}
	});

	function switchModule(mod: 'v26' | 'lp' | 'lm') {
		$activeModule = mod;
	}
</script>

<svelte:head>
	<title>ML3K v2</title>
</svelte:head>

{#if $role}
	<div class="app-shell">
		<header class="app-header">
			<div style="display:flex;align-items:center;gap:12px">
				<div>
					<div style="font-size:14px;font-weight:700">
						ML3K
						<span style="font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px;{$role === 'admin' ? 'background:var(--as);color:var(--ac)' : 'background:var(--bg);color:var(--ts)'}">
							{$role === 'admin' ? 'Admin ✕' : 'Viewer'}
						</span>
						<span class="sb-status" class:connected={$connected} class:checking={!$connected}>
							<span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span>
							{$connected ? 'Connected' : 'Checking...'}
						</span>
					</div>
				</div>
			</div>
			<div class="mod-sw">
				<button class="mod-btn" class:active={$activeModule === 'v26'} onclick={() => switchModule('v26')}>🌍 Vision</button>
				<button class="mod-btn" class:active={$activeModule === 'lp'} onclick={() => switchModule('lp')}>📦 Load Plan</button>
				<button class="mod-btn" class:active={$activeModule === 'lm'} onclick={() => switchModule('lm')}>🚛 Last Mile</button>
			</div>
		</header>
		<main class="app-body">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}
