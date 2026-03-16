<script lang="ts">
	import { onMount } from 'svelte';
	import { getLPDemand, getLPSettings, getLPDestinations, getLPHolds, updateCustomsOverride, toggleHSConfirm, upsertHold, removeHold } from '$lib/db';
	import { role } from '$lib/stores';

	let demand = $state<any[]>([]);
	let settings = $state<any>(null);
	let destinations = $state<any[]>([]);
	let holds = $state<any[]>([]);
	let loading = $state(true);
	let activeTab = $state<'demand' | 'plan' | 'arrivals' | 'late'>('demand');

	// Filters
	let searchText = $state('');
	let selectedSources = $state<Set<string>>(new Set());
	let selectedDests = $state<Set<string>>(new Set());
	let allSourcesSelected = $state(true);
	let allDestsSelected = $state(true);
	let srcDropOpen = $state(false);
	let destDropOpen = $state(false);

	// Derived
	let allSources = $derived([...new Set(demand.map(d => d.source).filter(Boolean))].sort());
	let allDestinations = $derived([...new Set(demand.map(d => d.destination).filter(Boolean))].sort());
	let holdSet = $derived(new Set(holds.map(h => `${h.destination}|${h.sku}`)));

	// Aggregate demand by SKU
	let skuRows = $derived.by(() => {
		const map = new Map<string, any>();
		for (const d of demand) {
			if (!map.has(d.sku)) {
				map.set(d.sku, {
					sku: d.sku, name: d.name || '', source: d.source || '',
					totalQty: 0, totalPallets: 0,
					hs_code: d.hs_code || '', country: d.country || '',
					unit_price: d.unit_price || 0, customs_name: d.customs_name || '',
					hs_confirmed: d.hs_confirmed || false,
					pallet_qty: d.pallet_qty || 0, pallet_spc: d.pallet_spc || 0,
					dests: {} as Record<string, number>
				});
			}
			const row = map.get(d.sku)!;
			row.totalQty += d.required_qty || 0;
			const pq = d.pallet_qty || 0;
			const ps = d.pallet_spc || 0;
			if (pq > 0) row.totalPallets += ((d.required_qty || 0) / pq) * ps;
			row.dests[d.destination] = (row.dests[d.destination] || 0) + (d.required_qty || 0);
		}
		return [...map.values()].sort((a, b) => a.sku.localeCompare(b.sku));
	});

	// Filtered rows
	let filteredRows = $derived.by(() => {
		return skuRows.filter(row => {
			const matchText = !searchText ||
				row.sku.toLowerCase().includes(searchText.toLowerCase()) ||
				row.name.toLowerCase().includes(searchText.toLowerCase()) ||
				row.source.toLowerCase().includes(searchText.toLowerCase());
			const matchSrc = allSourcesSelected || selectedSources.has(row.source);
			const matchDest = allDestsSelected || Object.keys(row.dests).some(d => selectedDests.has(d));
			return matchText && matchSrc && matchDest;
		});
	});

	let grandQty = $derived(filteredRows.reduce((s, r) => s + r.totalQty, 0));
	let grandPlt = $derived(filteredRows.reduce((s, r) => s + r.totalPallets, 0));
	let confirmedCount = $derived(filteredRows.filter(r => r.hs_confirmed).length);

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		const [d, s, dest, h] = await Promise.all([
			getLPDemand(), getLPSettings(), getLPDestinations(), getLPHolds()
		]);
		demand = d;
		settings = s;
		destinations = dest;
		holds = h;
		loading = false;
	}

	function toggleSource(src: string) {
		const next = new Set(selectedSources);
		if (next.has(src)) next.delete(src); else next.add(src);
		selectedSources = next;
		allSourcesSelected = next.size === 0 || next.size === allSources.length;
	}

	function toggleDest(dest: string) {
		const next = new Set(selectedDests);
		if (next.has(dest)) next.delete(dest); else next.add(dest);
		selectedDests = next;
		allDestsSelected = next.size === 0 || next.size === allDestinations.length;
	}

	function selectAllSources(all: boolean) {
		if (all) { selectedSources = new Set(allSources); allSourcesSelected = true; }
		else { selectedSources = new Set(); allSourcesSelected = false; }
	}

	function selectAllDests(all: boolean) {
		if (all) { selectedDests = new Set(allDestinations); allDestsSelected = true; }
		else { selectedDests = new Set(); allDestsSelected = false; }
	}

	async function onCustomsChange(sku: string, field: string, value: string) {
		if ($role !== 'admin') return;
		const fields: Record<string, any> = {};
		if (field === 'price') fields.price = parseFloat(value) || null;
		else fields[field] = value || null;
		await updateCustomsOverride(sku, fields);
	}

	async function onHSConfirm(sku: string, current: boolean) {
		if ($role !== 'admin') return;
		await toggleHSConfirm(sku, !current);
		// Reload to reflect change
		const d = await getLPDemand();
		demand = d;
	}
</script>

<!-- LP Tab Bar -->
<div style="display:flex;gap:2px;padding:6px 0;margin-bottom:12px;border-bottom:1px solid var(--bd)">
	{#each [['demand','📋 Demand'],['plan','🚛 Plan'],['arrivals','📥 Arrivals'],['late','⚠ Late']] as [tab, label]}
		<button class="rbtn" style={activeTab === tab ? 'background:var(--as);color:var(--ac);border-color:var(--ab)' : ''}
			onclick={() => activeTab = tab as any}>{label}</button>
	{/each}
</div>

{#if loading}
	<div style="text-align:center;padding:40px">
		<div class="spn" style="width:32px;height:32px;margin:0 auto 12px"></div>
		<div style="font-size:12px;color:var(--ts)">Loading demand data...</div>
	</div>
{:else if activeTab === 'demand'}
	<!-- Stats bar -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
		<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--bg);color:var(--ts);font-weight:600">
			{filteredRows.length} SKUs · {grandQty.toLocaleString()} pcs · {grandPlt.toFixed(1)} plt
			<span style="font-size:9px;color:var(--tt);margin-left:4px">({demand.length} raw rows)</span>
		</span>
		<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--gs);color:var(--gn);font-weight:600">
			✓ {confirmedCount} confirmed
		</span>
		{#if holds.length > 0}
			<span style="font-size:11px;padding:4px 10px;border-radius:4px;background:var(--os);color:var(--or);font-weight:600">
				⏸ {holds.length} holds
			</span>
		{/if}
	</div>

	<!-- Filters -->
	<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
		<input type="text" bind:value={searchText} placeholder="Search SKU, name, source..."
			style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:11px;font-family:var(--fd);outline:none">

		<!-- Source dropdown -->
		<div style="position:relative">
			<button class="rbtn" onclick={() => { srcDropOpen = !srcDropOpen; destDropOpen = false }}>
				{allSourcesSelected ? 'All Sources' : selectedSources.size + ' Source' + (selectedSources.size !== 1 ? 's' : '')} ▾
			</button>
			{#if srcDropOpen}
				<div style="position:absolute;top:34px;left:0;z-index:90;background:var(--sf);border:1px solid var(--bd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);padding:6px;min-width:160px;max-height:260px;overflow-y:auto">
					<div style="display:flex;gap:4px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--bd)">
						<button onclick={() => selectAllSources(true)} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--gs);color:var(--gn);cursor:pointer">All</button>
						<button onclick={() => selectAllSources(false)} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--rs);color:var(--rd);cursor:pointer">None</button>
					</div>
					{#each allSources as src}
						<label style="display:flex;align-items:center;gap:5px;padding:3px 4px;font-size:10px;cursor:pointer">
							<input type="checkbox" checked={allSourcesSelected || selectedSources.has(src)} onchange={() => toggleSource(src)}>
							{src}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Destination dropdown -->
		<div style="position:relative">
			<button class="rbtn" onclick={() => { destDropOpen = !destDropOpen; srcDropOpen = false }}>
				{allDestsSelected ? 'All Destinations' : selectedDests.size + ' Dest' + (selectedDests.size !== 1 ? 's' : '')} ▾
			</button>
			{#if destDropOpen}
				<div style="position:absolute;top:34px;left:0;z-index:90;background:var(--sf);border:1px solid var(--bd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);padding:6px;min-width:180px;max-height:260px;overflow-y:auto">
					<div style="display:flex;gap:3px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--bd);flex-wrap:wrap">
						<button onclick={() => selectAllDests(true)} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--gs);color:var(--gn);cursor:pointer">All</button>
						<button onclick={() => selectAllDests(false)} style="font-size:9px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;background:var(--rs);color:var(--rd);cursor:pointer">None</button>
					</div>
					{#each allDestinations as dest}
						<label style="display:flex;align-items:center;gap:5px;padding:3px 4px;font-size:10px;cursor:pointer">
							<input type="checkbox" checked={allDestsSelected || selectedDests.has(dest)} onchange={() => toggleDest(dest)}>
							{dest}
						</label>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Demand Table -->
	<div style="overflow-x:auto;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r)">
		<table class="dtb">
			<thead>
				<tr>
					<th>SKU</th>
					<th>Name</th>
					<th>Source</th>
					<th>Total Qty</th>
					<th>Price</th>
					<th>HS Code</th>
					<th>COO</th>
					<th>Customs Name</th>
					<th>Plt Qty</th>
					<th>Pallets</th>
					<th>Destinations</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredRows as row (row.sku)}
					<tr>
						<td class="mono" style="white-space:nowrap">{row.sku}</td>
						<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={row.name}>{row.name || '—'}</td>
						<td style="font-size:10px;color:var(--ts);white-space:nowrap">{row.source || '—'}</td>
						<td class="mono fw7">{row.totalQty.toLocaleString()}</td>
						<td class="mono">
							{#if $role === 'admin'}
								<input type="number" step="0.01" min="0" value={row.unit_price || ''}
									onchange={(e) => onCustomsChange(row.sku, 'price', e.currentTarget.value)}
									style="width:60px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}
								{row.unit_price || '—'}
							{/if}
						</td>
						<td class="mono" style={row.hs_confirmed ? 'color:var(--gn);font-weight:700;background:var(--gs)' : ''}>
							{#if $role === 'admin'}
								<input type="text" value={row.hs_code || ''} placeholder="0000.00"
									onchange={(e) => onCustomsChange(row.sku, 'hs_code', e.currentTarget.value)}
									style="width:70px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid {row.hs_confirmed ? 'var(--gn)' : 'var(--bd)'};border-radius:4px;outline:none;background:{row.hs_confirmed ? 'var(--gs)' : 'var(--sf)'}">
								{#if row.hs_code}
									<button onclick={() => onHSConfirm(row.sku, row.hs_confirmed)}
										style="cursor:pointer;font-size:10px;margin-left:2px;border:none;background:none;{row.hs_confirmed ? 'color:var(--gn)' : 'color:var(--tt);opacity:.5'}"
										title={row.hs_confirmed ? 'Confirmed — click to unconfirm' : 'Click to confirm'}>
										{row.hs_confirmed ? '✓' : '○'}
									</button>
								{/if}
							{:else}
								{row.hs_code || '—'}
							{/if}
						</td>
						<td class="mono">
							{#if $role === 'admin'}
								<input type="text" value={row.country || ''} placeholder="China"
									onchange={(e) => onCustomsChange(row.sku, 'country', e.currentTarget.value)}
									style="width:44px;font-size:10px;font-family:var(--fm);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}
								{row.country || '—'}
							{/if}
						</td>
						<td>
							{#if $role === 'admin'}
								<input type="text" value={row.customs_name || ''} placeholder="Customs description"
									onchange={(e) => onCustomsChange(row.sku, 'customs_name', e.currentTarget.value)}
									style="width:100px;font-size:10px;font-family:var(--fd);padding:2px 4px;border:1px solid var(--bd);border-radius:4px;outline:none">
							{:else}
								{row.customs_name || '—'}
							{/if}
						</td>
						<td class="mono">{row.pallet_qty || '—'}</td>
						<td class="mono">{row.totalPallets > 0 ? row.totalPallets.toFixed(1) : '—'}</td>
						<td style="white-space:normal">
							{#each Object.entries(row.dests) as [dest, qty]}
								<span style="display:inline-block;padding:1px 6px;margin:1px;border-radius:4px;font-size:9px;font-weight:600;background:var(--bg);color:var(--ts);border:1px solid var(--bd);{holdSet.has(`${dest}|${row.sku}`) ? 'opacity:.4;text-decoration:line-through' : ''}">
									{dest.replace(/\s*\/\s*(CORT|RIC)\s*$/i, '')} {qty.toLocaleString()}
								</span>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<div class="card" style="text-align:center;padding:40px">
		<div style="font-size:14px;font-weight:700;margin-bottom:8px">{activeTab === 'plan' ? '🚛 Plan' : activeTab === 'arrivals' ? '📥 Arrivals' : '⚠ Late'}</div>
		<div style="font-size:12px;color:var(--ts)">Coming soon — building this module next</div>
	</div>
{/if}
