<script lang="ts">
	import { role, activeModule, connected } from '$lib/stores';
	import { loadLPFromSharedState } from '$lib/migrate';

	let username = $state('');
	let password = $state('');
	let lpData = $state<any>(null);
	let loading = $state(false);

	function login() {
		if (username.toLowerCase() === 'come' && password.toLowerCase() === 'in') {
			$role = 'admin';
		} else if (username.toLowerCase() === 'viewer') {
			$role = 'viewer';
		}
	}

	async function testMigration() {
		loading = true;
		try {
			lpData = await loadLPFromSharedState();
		} catch (e: any) {
			lpData = { error: e.message };
		}
		loading = false;
	}
</script>

{#if !$role}
	<!-- Login -->
	<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--bg)">
		<div style="background:var(--sf);padding:32px;border-radius:12px;border:1px solid var(--bd);box-shadow:0 4px 20px rgba(0,0,0,.08);max-width:360px;width:100%">
			<div style="text-align:center;margin-bottom:24px">
				<div style="font-size:24px;font-weight:700">ML3K <span style="color:var(--ac)">v2</span></div>
				<div style="font-size:11px;color:var(--ts);margin-top:4px">FIFA World Cup 2026 · Logistics Manager</div>
			</div>
			<div style="display:flex;flex-direction:column;gap:10px">
				<input bind:value={username} placeholder="Username" onkeydown={(e) => e.key === 'Enter' && login()}
					style="padding:10px 14px;border:1px solid var(--bd);border-radius:8px;font-size:13px;font-family:var(--fd);outline:none">
				<input bind:value={password} type="password" placeholder="Password" onkeydown={(e) => e.key === 'Enter' && login()}
					style="padding:10px 14px;border:1px solid var(--bd);border-radius:8px;font-size:13px;font-family:var(--fd);outline:none">
				<button class="mbtn mbtn-primary" onclick={login} style="width:100%;margin-top:4px">Enter</button>
			</div>
			<div style="text-align:center;margin-top:16px;font-size:10px;color:var(--tt)">
				©2026 Vladislav Abramov | <span style="font-weight:600">SM²ARTA™</span>
			</div>
		</div>
	</div>
{:else}
	<!-- Dashboard -->
	<div style="max-width:800px;margin:0 auto">
		<div class="card">
			<h2 style="font-size:16px;font-weight:700;margin-bottom:8px">🚀 ML3K v2 — Migration Dashboard</h2>
			<p style="font-size:12px;color:var(--ts);margin-bottom:16px">
				SvelteKit + Supabase. Currently reading from shared_state (v1 data).
			</p>
			<div style="display:flex;gap:8px;margin-bottom:16px">
				<span class="sb-status" class:connected={$connected} class:checking={!$connected}>
					<span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span>
					Supabase: {$connected ? 'Connected' : 'Checking...'}
				</span>
				<span class="sb-status connected">Module: {$activeModule.toUpperCase()}</span>
			</div>
			<button class="rbtn" onclick={testMigration} style="background:var(--as);color:var(--ac);border-color:var(--ab)">
				{loading ? 'Loading...' : '📥 Test: Load LP Data from v1'}
			</button>
		</div>

		{#if lpData}
			<div class="card">
				<h3 style="font-size:14px;font-weight:700;margin-bottom:8px">LP Data from shared_state</h3>
				{#if lpData.error}
					<div style="color:var(--rd);font-size:12px">{lpData.error}</div>
				{:else}
					<div style="font-size:11px;color:var(--ts);display:grid;grid-template-columns:1fr 1fr;gap:8px">
						<div>Plan generated: <b>{lpData.config?.planGenerated ? 'Yes' : 'No'}</b></div>
						<div>SKUs in nomenclature: <b>{Object.keys(lpData.nomenclature).length}</b></div>
						<div>Demand rows: <b>{lpData.materialPlan.length}</b></div>
						<div>Arrival items: <b>{lpData.arrivals.length}</b></div>
						<div>Plan rows: <b>{lpData.generatedPlan.length}</b></div>
						<div>Customs overrides: <b>{Object.keys(lpData.truckState?.customsOverrides || {}).length}</b></div>
						<div>Dispatched trucks: <b>{(lpData.truckState?.dispatched || []).length}</b></div>
						<div>Holds: <b>{(lpData.truckState?.holds || []).length}</b></div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
