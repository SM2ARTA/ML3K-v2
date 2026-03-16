<script lang="ts">
	import { role, activeModule, connected } from '$lib/stores';
	import { getSystemStats } from '$lib/db';
	import { loadLPFromSharedState } from '$lib/migrate';

	let username = $state('');
	let password = $state('');
	let v2Stats = $state<any>(null);
	let v1Stats = $state<any>(null);
	let loading = $state(false);
	let migrationStatus = $state('');

	function login() {
		if (username.toLowerCase() === 'come' && password.toLowerCase() === 'in') {
			$role = 'admin';
			loadDashboard();
		} else if (username.toLowerCase() === 'viewer') {
			$role = 'viewer';
			loadDashboard();
		}
	}

	async function loadDashboard() {
		loading = true;
		try {
			v2Stats = await getSystemStats();
		} catch (e: any) {
			v2Stats = { error: e.message };
		}
		loading = false;
	}

	async function loadV1Comparison() {
		loading = true;
		try {
			const lp = await loadLPFromSharedState();
			v1Stats = {
				skus: Object.keys(lp.nomenclature).length,
				demand: lp.materialPlan.length,
				plan: lp.generatedPlan.length,
				customs: Object.keys(lp.truckState?.customsOverrides || {}).length,
				holds: (lp.truckState?.holds || []).length,
				dispatched: (lp.truckState?.dispatched || []).length,
				arrivals: lp.arrivals.length
			};
		} catch (e: any) {
			v1Stats = { error: e.message };
		}
		loading = false;
	}
</script>

{#if !$role}
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
	<div style="max-width:900px;margin:0 auto">
		<div class="card">
			<h2 style="font-size:16px;font-weight:700;margin-bottom:4px">🚀 ML3K v2 — Dashboard</h2>
			<p style="font-size:11px;color:var(--ts);margin-bottom:16px">SvelteKit + Supabase with proper normalized tables</p>

			<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
				<span class="sb-status" class:connected={$connected} class:checking={!$connected}>
					<span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span>
					Supabase: {$connected ? 'Connected' : 'Checking...'}
				</span>
				<span class="sb-status connected">Module: {$activeModule.toUpperCase()}</span>
				<span class="sb-status connected">Role: {$role}</span>
			</div>
		</div>

		{#if loading}
			<div class="card" style="text-align:center;padding:32px">
				<div class="spn" style="width:32px;height:32px;margin:0 auto 12px"></div>
				<div style="font-size:12px;color:var(--ts)">Loading data...</div>
			</div>
		{/if}

		<!-- v2 Tables Stats -->
		{#if v2Stats && !v2Stats.error}
			<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
				<div class="card">
					<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:8px">📦 LOAD PLAN</div>
					<div style="display:grid;gap:4px;font-size:11px">
						<div>SKUs: <b style="color:var(--ac)">{v2Stats.lp.skus}</b></div>
						<div>Demand: <b>{v2Stats.lp.demandRows}</b></div>
						<div>Plan: <b>{v2Stats.lp.planRows}</b></div>
						<div>Customs: <b style="color:var(--pu)">{v2Stats.lp.customsOverrides}</b></div>
						<div>Holds: <b style="color:var(--or)">{v2Stats.lp.holds}</b></div>
					</div>
				</div>
				<div class="card">
					<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:8px">🚛 LAST MILE</div>
					<div style="display:grid;gap:4px;font-size:11px">
						<div>SKUs: <b style="color:var(--ac)">{v2Stats.lm.skus}</b></div>
						<div>Demand: <b>{v2Stats.lm.demandRows}</b></div>
						<div>Venues: <b style="color:var(--gn)">{v2Stats.lm.venues}</b></div>
					</div>
				</div>
				<div class="card">
					<div style="font-size:10px;color:var(--ts);font-weight:600;margin-bottom:8px">📊 STOCK</div>
					<div style="display:grid;gap:4px;font-size:11px">
						<div>SKUs: <b>{v2Stats.stock.skus}</b></div>
					</div>
				</div>
			</div>
		{:else if v2Stats?.error}
			<div class="card" style="border-color:var(--or)">
				<div style="color:var(--or);font-size:12px">
					v2 tables not found — run the migration SQL first.
					<br><span style="font-size:10px;color:var(--ts)">{v2Stats.error}</span>
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="card">
			<div style="font-size:12px;font-weight:700;margin-bottom:8px">Migration Tools</div>
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				<button class="rbtn" onclick={loadDashboard} style="background:var(--as);color:var(--ac);border-color:var(--ab)">
					🔄 Refresh v2 Stats
				</button>
				<button class="rbtn" onclick={loadV1Comparison} style="background:var(--ps);color:var(--pu);border-color:#D4C5FE">
					📊 Compare with v1
				</button>
			</div>
		</div>

		<!-- v1 vs v2 Comparison -->
		{#if v1Stats && !v1Stats.error}
			<div class="card">
				<div style="font-size:12px;font-weight:700;margin-bottom:8px">v1 ↔ v2 Data Comparison</div>
				<table class="dtb">
					<thead>
						<tr><th>Metric</th><th>v1 (shared_state)</th><th>v2 (tables)</th><th>Match</th></tr>
					</thead>
					<tbody>
						{@const checks = [
							['LP SKUs', v1Stats.skus, v2Stats?.lp?.skus],
							['LP Demand rows', v1Stats.demand, v2Stats?.lp?.demandRows],
							['LP Plan rows', v1Stats.plan, v2Stats?.lp?.planRows],
							['LP Customs overrides', v1Stats.customs, v2Stats?.lp?.customsOverrides],
							['LP Holds', v1Stats.holds, v2Stats?.lp?.holds]
						]}
						{#each checks as [label, v1, v2]}
							<tr>
								<td>{label}</td>
								<td class="mono">{v1}</td>
								<td class="mono">{v2 ?? '—'}</td>
								<td>{v1 === v2 ? '✅' : '⚠️'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if v1Stats?.error}
			<div class="card"><div style="color:var(--rd);font-size:12px">{v1Stats.error}</div></div>
		{/if}
	</div>
{/if}
