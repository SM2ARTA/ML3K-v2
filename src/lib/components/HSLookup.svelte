<script lang="ts">
	import Modal from './Modal.svelte';
	import StatBadge from './StatBadge.svelte';
	import Spinner from './Spinner.svelte';
	import { HS_DB, HS_CATS, HS_CUSTOMS_NAMES, type HSCategory } from '$lib/hs-data';
	import { hsNormalize, parseProductName, findSiblings, detectCategories, searchHSCodes, groupByHeading, aiLookup, getAIProvider, getAIKey, setAI, clearAI } from '$lib/hs-utils';
	import { updateCustomsOverride } from '$lib/db';

	let { open = $bindable(false), sku, name, currentHS = '', demandData = [], customsOverrides = {}, onAccept }: {
		open: boolean; sku: string; name: string; currentHS?: string;
		demandData?: any[]; customsOverrides?: Record<string, any>;
		onAccept: (sku: string, fields: Record<string, any>) => void;
	} = $props();

	let step = $state(0); // 0=main, 1=headings, 2=subheadings, 3=accept
	let selectedCat = $state<HSCategory | null>(null);
	let selectedHeading = $state('');
	let url = $state('');
	let searchQ = $state('');
	let aiStatus = $state('');
	let aiResult = $state<any>(null);
	let acceptData = $state<{ code: string; customsName: string; country: string }>({ code: '', customsName: '', country: '' });

	// Reset when opened
	$effect(() => {
		if (open) {
			step = 0; selectedCat = null; selectedHeading = ''; url = '';
			searchQ = name || sku; aiStatus = ''; aiResult = null;
		}
	});

	let siblings = $derived(findSiblings(sku, demandData, customsOverrides));
	let detectedCats = $derived(detectCategories(name));
	let hasAIKey = $derived(!!getAIKey());
	let aiProvider = $derived(getAIProvider());

	// Step 1: headings in selected category
	let headings = $derived.by(() => {
		if (!selectedCat) return [];
		const chSet = new Set(selectedCat.ch);
		const items = HS_DB.filter(i => chSet.has(i.c.slice(0, 2)));
		return groupByHeading(items);
	});

	// Step 2: codes under selected heading
	let subheadings = $derived(HS_DB.filter(i => i.c.startsWith(selectedHeading)));

	async function doAIClassify() {
		const provider = getAIProvider();
		if (!provider || !getAIKey()) { aiStatus = 'setup'; return; }
		aiStatus = 'loading';
		const result = await aiLookup(searchQ || name, url, '', '');
		if (result.error) {
			if (result.error === 'bad_key') { clearAI(); aiStatus = 'bad_key'; }
			else aiStatus = 'error: ' + (result.detail || result.error).slice(0, 200);
		} else {
			aiResult = result;
			aiStatus = 'done';
		}
	}

	function acceptCode(code: string, cn: string, country: string) {
		acceptData = { code: hsNormalize(code), customsName: cn, country };
		step = 3;
	}

	async function saveAndClose() {
		const fields: Record<string, any> = { hs_code: acceptData.code };
		if (acceptData.customsName) fields.customs_name = acceptData.customsName;
		if (acceptData.country) fields.country = acceptData.country;
		await updateCustomsOverride(sku, fields);
		onAccept(sku, fields);
		open = false;
	}

	function useSibling(hs: string, cn: string) {
		acceptCode(hs, cn, '');
	}

	// AI setup
	let setupProvider = $state('claude');
	let setupKey = $state('');
	function saveAIKey() {
		if (!setupKey) return;
		setAI(setupProvider, setupKey);
		aiStatus = '';
		doAIClassify();
	}
</script>

<Modal title="🔍 HS Code Assistant" subtitle="{sku} · {name}" bind:open maxWidth="640px">
	{#if step === 0}
		<!-- Siblings -->
		{#if siblings.length > 0}
			<div style="background:var(--ps);border:1px solid #D4C5FE;border-radius:8px;padding:12px;margin-bottom:12px">
				<div style="font-size:11px;font-weight:700;color:var(--pu);margin-bottom:6px">⚡ Same product family</div>
				{#each siblings as s}
					<div onclick={() => useSibling(s.hsCode, s.customsName)} style="padding:6px 8px;background:var(--sf);border:1px solid var(--bd);border-radius:6px;margin-bottom:3px;cursor:pointer;font-size:10px" class="hover-highlight">
						<span style="font-family:var(--fm);font-weight:700;color:var(--pu)">{s.hsCode}</span>
						{#if s.customsName}<span style="color:var(--gn);margin-left:6px">{s.customsName}</span>{/if}
						<div style="font-size:9px;color:var(--ts);margin-top:2px">{s.sku} · {s.name} [{s.source}]</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- AI Classification -->
		<div style="font-size:12px;font-weight:700;color:var(--tp);margin-bottom:4px">Step 1 · AI Classification</div>
		<input type="text" bind:value={searchQ} placeholder="Product name..."
			style="width:100%;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:10px;font-family:var(--fd);outline:none;box-sizing:border-box;margin-bottom:4px">
		<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center">
			<input type="text" bind:value={url} placeholder="Product URL (optional)"
				style="flex:1;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:10px;outline:none">
			<button onclick={() => navigator.clipboard?.readText().then(t => { if (t?.startsWith('http')) url = t }).catch(() => {})}
				style="padding:5px 8px;font-size:11px;border:1px solid var(--bd);border-radius:6px;background:var(--sf);cursor:pointer">📋</button>
			<button class="rbtn" onclick={() => window.open('https://www.google.com/search?q=' + encodeURIComponent(searchQ), '_blank')}
				style="font-size:9px;padding:4px 8px;color:#4285F4;border:1px solid #ddd">Google</button>
		</div>
		<button class="mbtn mbtn-primary" onclick={doAIClassify} style="width:100%;margin-bottom:8px;{hasAIKey ? '' : 'background:var(--ts)'}">
			{hasAIKey ? '✨ Classify' : '✨ Setup AI'}
		</button>

		<!-- AI Status -->
		{#if aiStatus === 'loading'}
			<div style="text-align:center;padding:12px"><div class="spn" style="width:20px;height:20px;margin:0 auto 6px"></div><div style="font-size:10px;color:var(--ts)">Classifying...</div></div>
		{:else if aiStatus === 'setup' || aiStatus === 'bad_key'}
			<div style="background:var(--bg);padding:10px;border-radius:8px;margin-bottom:8px">
				<div style="font-size:11px;font-weight:600;margin-bottom:6px">Setup AI Provider</div>
				<div style="display:flex;gap:4px;margin-bottom:6px">
					{#each [['claude', 'Claude'], ['openai', 'ChatGPT'], ['gemini', 'Gemini']] as [id, label]}
						<button onclick={() => setupProvider = id} style="flex:1;padding:6px;font-size:10px;border:1px solid {setupProvider === id ? 'var(--ac)' : 'var(--bd)'};border-radius:4px;background:{setupProvider === id ? 'var(--as)' : 'var(--sf)'};cursor:pointer">{label}</button>
					{/each}
				</div>
				<div style="display:flex;gap:4px">
					<input type="password" bind:value={setupKey} placeholder="API key" style="flex:1;padding:6px;border:1px solid var(--bd);border-radius:4px;font-size:10px;outline:none">
					<button class="mbtn mbtn-primary" onclick={saveAIKey} style="padding:6px 12px;font-size:10px">Save</button>
				</div>
			</div>
		{:else if aiStatus === 'done' && aiResult}
			<div style="background:linear-gradient(135deg,#f0ebfe,#ede7fb);border:1px solid #D4C5FE;border-radius:8px;padding:10px;margin-bottom:8px">
				<div style="font-size:11px;font-weight:700;color:var(--pu);margin-bottom:4px">✨ AI Results</div>
				{#if aiResult.notes}<div style="font-size:9px;color:var(--ts);margin-bottom:4px;font-style:italic">{aiResult.notes}</div>{/if}
				{#each (aiResult.codes || []) as c}
					<div onclick={() => acceptCode(c.hs, c.customsName || '', aiResult.country?.primary || '')}
						style="padding:6px 8px;background:var(--sf);border:1px solid var(--bd);border-radius:6px;margin-bottom:3px;cursor:pointer" class="hover-highlight">
						<div style="display:flex;align-items:center;gap:6px">
							<span style="font-family:var(--fm);font-size:13px;font-weight:700;color:var(--pu)">{c.hs}</span>
							<span style="font-size:10px;font-weight:600;flex:1">{c.description}</span>
							<span style="font-size:8px;color:var(--gn);background:var(--gs);padding:1px 5px;border-radius:3px">{c.confidence}</span>
						</div>
						{#if c.customsName}<div style="font-size:10px;color:var(--gn);margin-top:2px">→ {c.customsName}</div>{/if}
					</div>
				{/each}
			</div>
		{:else if aiStatus.startsWith('error')}
			<div style="background:var(--os);padding:8px;border-radius:6px;font-size:10px;color:var(--or);margin-bottom:8px">{aiStatus}</div>
		{/if}

		<!-- Manual categories -->
		<div style="border-top:1px solid var(--bd);padding-top:8px;margin-top:4px">
			<div style="font-size:10px;font-weight:600;color:var(--ts);margin-bottom:6px">Or select category manually:</div>
			{#if detectedCats.length}
				<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">
					{#each detectedCats.slice(0, 4) as cat}
						<button onclick={() => { selectedCat = cat; step = 1; }} style="padding:4px 8px;border:1px solid var(--ab);background:var(--as);border-radius:5px;font-size:9px;cursor:pointer;font-weight:600">{cat.icon} {cat.name}</button>
					{/each}
				</div>
			{/if}
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
				{#each HS_CATS.filter(c => !detectedCats.slice(0,4).some(d => d.id === c.id)) as cat}
					<button onclick={() => { selectedCat = cat; step = 1; }} style="padding:4px 6px;border:1px solid var(--bd);border-radius:4px;font-size:8px;cursor:pointer;text-align:left" class="hover-highlight">{cat.icon} {cat.name}</button>
				{/each}
			</div>
		</div>

	{:else if step === 1}
		<!-- Headings -->
		<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
			<span style="font-size:14px">{selectedCat?.icon}</span>
			<span style="font-size:12px;font-weight:700">{selectedCat?.name}</span>
			<button onclick={() => step = 0} style="font-size:9px;color:var(--ts);background:none;border:1px solid var(--bd);border-radius:4px;padding:2px 6px;cursor:pointer;margin-left:auto">← Back</button>
		</div>
		<div style="font-size:11px;font-weight:700;margin-bottom:6px">Select 4-digit heading:</div>
		{#each headings as hd}
			<button onclick={() => { selectedHeading = hd.code; step = 2; }}
				style="display:block;width:100%;text-align:left;padding:8px 10px;border:1px solid var(--bd);border-radius:6px;margin-bottom:3px;cursor:pointer;background:var(--sf)" class="hover-highlight">
				<span style="font-family:var(--fm);font-weight:700;color:var(--ac)">{hd.code}</span>
				<span style="font-size:10px;margin-left:6px">{hd.label}</span>
				<span style="font-size:9px;color:var(--tt);float:right">{hd.items.length} codes</span>
			</button>
		{/each}

	{:else if step === 2}
		<!-- Subheadings -->
		<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
			<span style="font-family:var(--fm);font-weight:700;color:var(--ac)">{selectedHeading}</span>
			<button onclick={() => step = 1} style="font-size:9px;color:var(--ts);background:none;border:1px solid var(--bd);border-radius:4px;padding:2px 6px;cursor:pointer;margin-left:auto">← Headings</button>
		</div>
		<div style="font-size:11px;font-weight:700;margin-bottom:6px">Select 6-digit code:</div>
		{#each subheadings as item}
			<button onclick={() => acceptCode(item.c, '', '')}
				style="display:block;width:100%;text-align:left;padding:8px 10px;border:1px solid var(--bd);border-radius:6px;margin-bottom:3px;cursor:pointer;background:var(--sf)" class="hover-highlight">
				<span style="font-family:var(--fm);font-weight:700;color:var(--ac)">{item.c}</span>
				<span style="font-size:10px;margin-left:6px">{item.d}</span>
			</button>
		{/each}

	{:else if step === 3}
		<!-- Accept -->
		<div style="background:var(--gs);padding:14px;border-radius:8px;border:1px solid #B8DFCA">
			<div style="font-size:13px;font-weight:700;color:var(--gn);margin-bottom:4px">✓ HS Code: <span style="font-family:var(--fm)">{acceptData.code}</span></div>
			<div style="margin-bottom:6px">
				<label style="font-size:10px;font-weight:600;color:var(--ts);display:block;margin-bottom:2px">Customs description</label>
				<input type="text" bind:value={acceptData.customsName} placeholder="Short customs name..."
					style="width:100%;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:11px;outline:none;box-sizing:border-box">
			</div>
			<div style="margin-bottom:8px">
				<label style="font-size:10px;font-weight:600;color:var(--ts);display:block;margin-bottom:2px">Country of Origin</label>
				<input type="text" bind:value={acceptData.country} placeholder="e.g. China"
					style="width:100%;padding:6px 10px;border:1px solid var(--bd);border-radius:6px;font-size:11px;outline:none;box-sizing:border-box">
			</div>
			<div style="display:flex;gap:6px">
				<button class="mbtn mbtn-primary" onclick={saveAndClose} style="background:var(--gn);border-color:var(--gn)">✓ Accept & Save</button>
				<button class="mbtn" onclick={() => step = 0}>← Back</button>
			</div>
		</div>
	{/if}
</Modal>

<style>
	:global(.hover-highlight:hover) { background: var(--bg) !important; border-color: var(--ac) !important; }
</style>
