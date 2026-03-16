<script lang="ts">
	import '../app.css';
	import { role, activeModule, connected } from '$lib/stores';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HelpDialog } from '$lib/components';
	import { exportBackup, importBackup } from '$lib/backup';

	let { children } = $props();
	let helpOpen = $state(false);
	let backupStatus = $state('');

	async function doBackup() {
		backupStatus = 'Exporting...';
		try { await exportBackup(); backupStatus = ''; }
		catch (e: any) { backupStatus = 'Error: ' + e.message; }
	}

	async function doRestore(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		backupStatus = 'Restoring...';
		try {
			const buf = await f.arrayBuffer();
			const log = await importBackup(buf);
			backupStatus = log.join(' | ');
			setTimeout(() => { backupStatus = ''; window.location.reload(); }, 3000);
		} catch (e: any) { backupStatus = 'Error: ' + e.message; }
		input.value = '';
	}

	onMount(async () => {
		try {
			const { data, error } = await supabase.from('shared_state').select('id').limit(1);
			if (!error) $connected = true;
		} catch {}
	});

	function switchModule(mod: 'v26' | 'lp' | 'lm') {
		$activeModule = mod;
		if (mod === 'lp') goto('/lp');
		else if (mod === 'lm') goto('/lm');
		else if (mod === 'v26') goto('/v26');
		else goto('/');
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
						ML3K <span style="color:var(--ac);font-size:10px">v2</span> <span style="font-size:8px;color:var(--tt);font-weight:400">b0316n</span>
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
			<div style="display:flex;align-items:center;gap:8px">
				<div class="mod-sw">
					<button class="mod-btn" class:active={$activeModule === 'v26'} onclick={() => switchModule('v26')}>🌍 Vision</button>
					<button class="mod-btn" class:active={$activeModule === 'lp'} onclick={() => switchModule('lp')}>📦 Load Plan</button>
					<button class="mod-btn" class:active={$activeModule === 'lm'} onclick={() => switchModule('lm')}>🚛 Last Mile</button>
				</div>
				<button class="rbtn" onclick={doBackup} style="font-size:10px;padding:4px 8px;background:var(--os);color:var(--or);border-color:#F5D6B8">💾 Backup</button>
				{#if $role === 'admin'}
					<label class="rbtn" style="font-size:10px;padding:4px 8px;background:var(--ps);color:var(--pu);border-color:#D4C5FE;cursor:pointer">
						📂 Restore
						<input type="file" accept=".xlsx" onchange={doRestore} style="position:absolute;width:1px;height:1px;opacity:0">
					</label>
				{/if}
				<button class="rbtn" onclick={() => helpOpen = true} style="font-size:10px;padding:4px 8px">? Help</button>
			</div>
		</header>
		<HelpDialog bind:open={helpOpen} />
		{#if backupStatus}
			<div style="padding:4px 16px;background:var(--os);font-size:10px;color:var(--or);text-align:center">{backupStatus}</div>
		{/if}
		<main class="app-body">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}
