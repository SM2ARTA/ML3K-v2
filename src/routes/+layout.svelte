<script lang="ts">
	import '../app.css';
	import { role, activeModule, connected } from '$lib/stores';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { HelpDialog, Toast } from '$lib/components';
	import { exportBackup, importBackup } from '$lib/backup';
	import { uploadStockReport } from '$lib/db';
	import { restoreUndo, hasUndo } from '$lib/undo';
	import * as XLSX from 'xlsx';
	import { startRealtime, stopRealtime } from '$lib/realtime';
	import { loadAIConfig } from '$lib/hs-utils';
	import { signOut } from '$lib/auth';
	import { doSystemReset, doResetLP, doSoftResetLP, doResetLM, doSoftResetLM } from '$lib/reset';
	import { Modal } from '$lib/components';

	let { children } = $props();
	let helpOpen = $state(false);
	let resetOpen = $state(false);
	let resetBusy = $state(false);
	let backupStatus = $state('');
	let stockStatus = $state('');
	let undoAvailable = $state(false);
	let realtimeActive = $state(false);
	let lastSync = $state('');

	async function doUndo() {
		const ok = await restoreUndo();
		undoAvailable = hasUndo();
		if (ok) window.location.reload();
	}

	$effect(() => { undoAvailable = hasUndo(); });

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

	async function doStockUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		stockStatus = 'Reading...';
		try {
			const buf = await f.arrayBuffer();
			const wb = XLSX.read(buf, { type: 'array' });
			const ws = wb.Sheets[wb.SheetNames[0]];
			const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);
			if (rows.length === 0) { stockStatus = 'No rows found'; return; }
			// Find SKU column
			const hdr = Object.keys(rows[0]);
			const skuCol = hdr.find(h => /^(sku|code|nomenclature.?code)$/i.test(h.trim()));
			const qtyCol = hdr.find(h => /^(qty|quantity|on.?hand|available)$/i.test(h.trim()));
			if (!skuCol || !qtyCol) { stockStatus = `Columns not found. Headers: ${hdr.join(', ')}`; return; }
			const items = rows
				.filter(r => r[skuCol] && Number(r[qtyCol]) > 0)
				.map(r => ({ sku: String(r[skuCol]).trim(), qty: Number(r[qtyCol]) || 0, report_name: f.name }));
			stockStatus = `Uploading ${items.length} SKUs...`;
			const count = await uploadStockReport(items);
			stockStatus = `Stock uploaded: ${count} SKUs from ${f.name}`;
			setTimeout(() => { stockStatus = ''; }, 4000);
		} catch (err: any) { stockStatus = 'Error: ' + err.message; }
		input.value = '';
	}

	onMount(async () => {
		// Load AI config from Supabase
		loadAIConfig().catch(() => {});
		try {
			const { data, error } = await supabase.from('shared_state').select('id').limit(1);
			if (!error) {
				$connected = true;
				// Start realtime subscriptions
				startRealtime((payload) => {
					lastSync = new Date().toLocaleTimeString();
					realtimeActive = true;
				});
			}
		} catch {}
	});

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && $role === 'admin') {
			e.preventDefault();
			doUndo();
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault(); // Prevent browser save dialog
		}
	}

	async function execReset(fn: () => Promise<void>) {
		resetBusy = true;
		try { await fn(); } catch (e: any) { alert('Reset failed: ' + e.message); }
		resetBusy = false;
		resetOpen = false;
		window.location.reload();
	}

	function switchModule(mod: 'v26' | 'lp' | 'lm') {
		$activeModule = mod;
		if (mod === 'lp') goto('/lp');
		else if (mod === 'lm') goto('/lm');
		else if (mod === 'v26') goto('/v26');
		else goto('/');
	}
</script>

<svelte:head>
	<title>ML3K v2{$role ? ` · ${$activeModule === 'lp' ? 'Load Plan' : $activeModule === 'lm' ? 'Last Mile' : 'Vision 2026'}` : ''}</title>
	<meta name="description" content="FIFA World Cup 2026 Ground Transport Logistics Manager">
</svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if $role}
	<div class="app-shell">
		<header class="app-header">
			<div style="display:flex;align-items:center;gap:12px">
				<div>
					<div style="font-size:14px;font-weight:700">
						ML3K <span style="color:var(--ac);font-size:10px">v2</span> <span style="font-size:8px;color:var(--tt);font-weight:400">b0316z</span>
						<button onclick={async () => { await signOut(); $role = ''; window.location.href = '/'; }}
							style="font-size:10px;padding:2px 6px;border-radius:4px;margin-left:4px;border:none;cursor:pointer;{$role === 'admin' ? 'background:var(--as);color:var(--ac)' : 'background:var(--bg);color:var(--ts)'}"
							title="Click to sign out">
							{$role === 'admin' ? 'Admin ✕' : 'Viewer ✕'}
						</button>
						<span class="sb-status" class:connected={$connected} class:checking={!$connected}>
							<span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span>
							{$connected ? (realtimeActive ? 'Live' : 'Connected') : 'Checking...'}
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
					<label class="rbtn" style="font-size:10px;padding:4px 8px;background:var(--gs);color:var(--gn);border-color:#B8DFCA;cursor:pointer">
						📊 Stock
						<input type="file" accept=".xlsx,.xls" onchange={doStockUpload} style="position:absolute;width:1px;height:1px;opacity:0">
					</label>
				{/if}
				<button class="rbtn" onclick={doUndo} disabled={!undoAvailable}
					style="font-size:10px;padding:4px 8px;opacity:{undoAvailable ? 1 : 0.3}" title="Undo last action">↩ Undo</button>
				<button class="rbtn" onclick={() => helpOpen = true} style="font-size:10px;padding:4px 8px">? Help</button>
				{#if $role === 'admin'}
					<button class="rbtn" onclick={() => resetOpen = true} style="font-size:10px;padding:4px 8px;background:var(--rs);color:var(--rd);border-color:#F5B8BA">↻ Reset</button>
				{/if}
			</div>
		</header>
		<HelpDialog bind:open={helpOpen} />
		<Modal title="↻ Reset Data" bind:open={resetOpen}>
			<div style="font-size:12px">
				{#if resetBusy}
					<div style="text-align:center;padding:20px">
						<div class="spn" style="width:24px;height:24px;margin:0 auto 8px"></div>
						<div style="color:var(--ts)">Resetting...</div>
					</div>
				{:else}
					<div style="margin-bottom:16px">
						<div style="font-weight:700;margin-bottom:6px">Load Plan</div>
						<div style="display:flex;gap:8px">
							<button class="mbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)" onclick={() => execReset(doSoftResetLP)}>📂 Soft Reset<br><span style="font-size:9px;font-weight:400">Re-upload files, keep overrides</span></button>
							<button class="mbtn mbtn-danger" onclick={() => { if(confirm('Erase ALL Load Plan data?')) execReset(doResetLP) }}>🗑 Hard Reset<br><span style="font-size:9px;font-weight:400">Erase everything</span></button>
						</div>
					</div>
					<div style="margin-bottom:16px">
						<div style="font-weight:700;margin-bottom:6px">Last Mile</div>
						<div style="display:flex;gap:8px">
							<button class="mbtn" style="background:var(--as);color:var(--ac);border-color:var(--ab)" onclick={() => execReset(doSoftResetLM)}>📂 Soft Reset<br><span style="font-size:9px;font-weight:400">Re-upload files, keep overrides</span></button>
							<button class="mbtn mbtn-danger" onclick={() => { if(confirm('Erase ALL Last Mile data?')) execReset(doResetLM) }}>🗑 Hard Reset<br><span style="font-size:9px;font-weight:400">Erase everything</span></button>
						</div>
					</div>
					<div style="border-top:1px solid var(--bd);padding-top:12px">
						<div style="font-weight:700;margin-bottom:6px;color:var(--rd)">System Reset</div>
						<button class="mbtn mbtn-danger mbtn-wide" onclick={() => { if(confirm('⚠ This erases ALL data for ALL modules. This cannot be undone. Continue?')) execReset(doSystemReset) }}>⚠ Reset Everything</button>
						<div style="font-size:9px;color:var(--tt);margin-top:4px">Erases all LP, LM, V26, stock data and returns to fresh state.</div>
					</div>
				{/if}
			</div>
		</Modal>
		{#if backupStatus}
			<div style="padding:4px 16px;background:var(--os);font-size:10px;color:var(--or);text-align:center">{backupStatus}</div>
		{/if}
		{#if stockStatus}
			<div style="padding:4px 16px;background:var(--gs);font-size:10px;color:var(--gn);text-align:center">{stockStatus}</div>
		{/if}
		<main class="app-body">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}
<Toast />
