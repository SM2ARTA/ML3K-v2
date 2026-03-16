<script lang="ts">
	import Modal from './Modal.svelte';
	let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<Modal title="ML3K — System Guide" subtitle="Complete reference for all modules" bind:open maxWidth="780px">
	<div style="font-size:12px;line-height:1.7;color:var(--ts)">
		<h4 style="color:var(--tp);margin:0 0 8px">📦 Load Plan — Warehouse Dispatch</h4>
		<p>Manages outbound shipping from Dallas warehouse to 8 LP destinations (Toronto, Vancouver, Mexico City, Guadalajara, Monterrey, Houston, Kansas City, New York/NJ).</p>
		<p><strong>Tabs:</strong><br>
		<strong>📥 Arrivals</strong> — container arrival schedule with dates and quantities.<br>
		<strong>📋 Demand</strong> — SKU-level demand with inline-editable customs fields (HS code, COO, price, customs name). Filter by source or destination. Hold by source to exclude from planning.<br>
		<strong>🚛 Plan</strong> — truck loading plan with cards grouped by date. Lock trucks, edit dispatch dates, assign LSR numbers. Click a card for detail modal with SKU manifest and CI export.<br>
		<strong>⚠ Late</strong> — analysis of containers arriving too late for LM dispatch windows.</p>

		<h4 style="color:var(--tp);margin:16px 0 8px">🚛 Last Mile — Venue Distribution</h4>
		<p>Final mile delivery from regional hubs to individual venues. Takes nomenclature, material plan, and generates truck loading plan per venue.</p>
		<p><strong>Tabs:</strong><br>
		<strong>📊 Dashboard</strong> — venue statistics, top venues by quantity.<br>
		<strong>📋 Demand</strong> — venue-level demand with bump-in dates and clusters.<br>
		<strong>🏟️ Venues</strong> — venue settings cards (capacity, max trucks, lead time).</p>

		<h4 style="color:var(--tp);margin:16px 0 8px">🌍 Vision 2026 — Command View</h4>
		<p>Unified dashboard showing cross-module KPIs: truck count, pallet totals, dispatch by destination, customs status.</p>

		<h4 style="color:var(--tp);margin:16px 0 8px">✨ HS Code Assistant</h4>
		<p>AI-powered tariff classification. Click 🔍 next to any HS code in the demand table. Three methods:<br>
		1. <strong>Sibling SKUs</strong> — reuse confirmed HS codes from same product family.<br>
		2. <strong>AI Classification</strong> (Claude/ChatGPT/Gemini) — paste product URL or classify by name.<br>
		3. <strong>Manual</strong> — browse HS categories, headings, subheadings.</p>

		<h4 style="color:var(--tp);margin:16px 0 8px">📄 Exports</h4>
		<p><strong>Demand Export</strong> — all customs data including HS confirmed status.<br>
		<strong>Plan Export</strong> — full truck plan + summary sheet.<br>
		<strong>CI Export</strong> — Commercial Invoice + Packing List per truck with party data (MEX/CAN).<br>
		<strong>Arrivals Export</strong> — container arrival schedule.</p>

		<h4 style="color:var(--tp);margin:16px 0 8px">⚙ Engine Settings</h4>
		<p>Plan tab → ⚙ Engine Settings: truck capacity (pallets), max trucks/day, max destinations/day, warehouse turnaround, RIC start date.<br>
		🚚 Transit Times: per-destination transit days and satellite WHS processing days.</p>

		<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--bd);text-align:center;font-size:10px;color:var(--tt)">
			©2026 Vladislav Abramov | <span style="font-weight:600">SM²ARTA™</span> · ML3K v2 · SvelteKit + Supabase
		</div>
	</div>
</Modal>
