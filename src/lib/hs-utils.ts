/** HS Code utility functions — ported from v1 */
import { HS_DB, HS_CATS, HS_CUSTOMS_NAMES, type HSEntry, type HSCategory } from './hs-data';
import { supabase } from './supabase';

/** Normalize HS code to XXXX.XX format */
export function hsNormalize(code: string): string {
	if (!code) return '';
	const digits = code.replace(/[^0-9]/g, '');
	if (digits.length <= 4) return digits;
	return digits.slice(0, 4) + '.' + digits.slice(4, 6);
}

/** Extract meaningful keywords from product name */
export function parseProductName(name: string): string[] {
	const noise = ['hold', 'fifa', 'generic', 'standard', 'custom', 'wc26', 'fwc', '2026', 'the', 'and', 'for', 'with', 'set', 'kit', 'pcs', 'each', 'per', 'lot', 'size', 'color', 'colour'];
	return name.toLowerCase().replace(/[–—\-_()[\]{}.,;:!?'"]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !noise.includes(w));
}

/** Extract keywords from URL */
export function parseURL(url: string): string[] {
	if (!url) return [];
	try {
		const u = new URL(url);
		return u.pathname.replace(/\.[^.]+$/, '').split(/[\/-]+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
	} catch {
		return url.split(/[\/-]+/).filter(w => w.length > 2 && !/^\d+$/.test(w));
	}
}

/** Find sibling SKUs with confirmed HS codes */
export function findSiblings(sku: string, demandData: any[], customsOverrides: Record<string, any>): any[] {
	const parts = sku.split(/[-_]/);
	if (parts.length < 3) return [];
	const prefix = parts.slice(0, parts.length - 1).join('-');
	const demandSkus = new Set(demandData.map(d => d.sku));
	const siblings: any[] = [];
	const seen = new Set<string>();

	for (const d of demandData) {
		if (d.sku === sku || seen.has(d.sku)) continue;
		if (d.sku.startsWith(prefix + '-') || d.sku.startsWith(prefix + '_')) {
			const ovr = customsOverrides[d.sku] || {};
			const hs = ovr.hs_code || '';
			const confirmed = !!ovr.hs_confirmed;
			if (hs && confirmed) {
				siblings.push({ sku: d.sku, name: d.name || d.sku, hsCode: hs, customsName: ovr.customs_name || '', source: d.source || '' });
				seen.add(d.sku);
			}
		}
	}
	return siblings;
}

/** Auto-detect categories from product name keywords */
export function detectCategories(name: string): (HSCategory & { score: number })[] {
	const kw = parseProductName(name);
	return HS_CATS.map(cat => {
		let score = 0;
		for (const t of kw) {
			for (const k of cat.kw) {
				if (k.includes(t) || t.includes(k)) score += 2;
				if (k === t) score += 3;
			}
		}
		return { ...cat, score };
	}).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
}

/** Search HS codes within a category */
export function searchHSCodes(categoryChapters: string[], allTerms: string[]): (HSEntry & { score: number })[] {
	const chSet = new Set(categoryChapters);
	const items = HS_DB.filter(item => chSet.has(item.c.slice(0, 2)));
	return items.map(item => {
		let score = 0;
		const kw = item.k;
		const desc = item.d.toLowerCase();
		for (const t of allTerms) {
			if (kw.includes(t)) score += 3;
			if (desc.includes(t)) score += 2;
			for (const p of kw.split(' ')) {
				if (p.startsWith(t) && t.length >= 3) score += 1;
			}
		}
		return { ...item, score };
	}).sort((a, b) => b.score - a.score);
}

/** Group HS codes by 4-digit heading */
export function groupByHeading(items: HSEntry[]): { code: string; label: string; items: HSEntry[] }[] {
	const map = new Map<string, { code: string; label: string; items: HSEntry[] }>();
	for (const item of items) {
		const h4 = item.c.slice(0, 4);
		if (!map.has(h4)) map.set(h4, { code: h4, label: item.d, items: [] });
		map.get(h4)!.items.push(item);
	}
	return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// ── AI Integration ──

export function getAIProvider(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem('hs-ai-provider') || '';
}

export function getAIKey(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem('hs-ai-key') || '';
}

export function setAI(provider: string, key: string) {
	localStorage.setItem('hs-ai-provider', provider);
	localStorage.setItem('hs-ai-key', (key || '').trim());
	supabase.from('app_settings').upsert({ key: 'ai_config', value: JSON.stringify({ provider, key: (key || '').trim() }) })
		.then(r => { if (r.error) console.warn('AI config save failed:', r.error); })
		.catch(e => console.warn('AI config save error:', e));
}

export function clearAI() {
	localStorage.removeItem('hs-ai-provider');
	localStorage.removeItem('hs-ai-key');
}

function buildPrompt(productName: string, url: string, material: string, usage: string) {
	const sys = `HS tariff classifier for customs declarations. Return JSON only:
{"codes":[{"hs":"XXXX.XX","description":"heading name","confidence":"high/medium/low","customsName":"SHORT customs name for CI, max 5-8 words"}],"country":{"primary":"MANUFACTURING country (NOT destination)","alternatives":["other likely"],"reasoning":"why"},"notes":"reasoning"}
Rules: 1-2 codes. 6-digit HS. customsName = SHORT (5-8 words). Country = where MANUFACTURED.`;
	let usr = '';
	if (url) {
		usr = `URL: ${url}\nIdentify the actual product from this URL. What is it made of? Where is it manufactured?`;
		usr += `\nInternal ref (may be coded): ${productName}`;
	} else {
		usr = `Product: ${productName}`;
	}
	if (material) usr += `\nMaterial: ${material}`;
	if (usage) usr += `\nUsage: ${usage}`;
	return { sys, usr };
}

export async function aiLookup(productName: string, url: string, material: string, usage: string): Promise<any> {
	const provider = getAIProvider();
	const key = getAIKey();
	if (!key || !provider) return { error: 'no_key' };
	const { sys, usr } = buildPrompt(productName, url, material, usage);

	try {
		let text = '';
		if (provider === 'claude') {
			const resp = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
				body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: sys, messages: [{ role: 'user', content: usr }] })
			});
			if (!resp.ok) { const err = await resp.text(); return { error: resp.status === 401 ? 'bad_key' : 'api_error', detail: err }; }
			text = (await resp.json())?.content?.[0]?.text || '';
		} else if (provider === 'openai') {
			const resp = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
				body: JSON.stringify({ model: 'gpt-5-mini', messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] })
			});
			if (!resp.ok) { const err = await resp.text(); return { error: resp.status === 401 ? 'bad_key' : 'api_error', detail: err }; }
			text = (await resp.json())?.choices?.[0]?.message?.content || '';
		} else {
			const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: usr }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 400 } })
			});
			if (!resp.ok) { const err = await resp.text(); return { error: resp.status === 401 ? 'bad_key' : 'api_error', detail: err }; }
			text = (await resp.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '';
		}
		const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
		const result = JSON.parse(jsonStr);
		if (result.codes) result.codes.forEach((c: any) => { c.hs = hsNormalize(c.hs); });
		return result;
	} catch (e: any) {
		return { error: 'parse_error', detail: String(e) };
	}
}

/** Load AI config from Supabase on startup */
export async function loadAIConfig() {
	try {
		const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_config').single();
		if (data?.value) {
			const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
			if (cfg.provider && cfg.key) {
				localStorage.setItem('hs-ai-provider', cfg.provider);
				localStorage.setItem('hs-ai-key', cfg.key);
			}
		}
	} catch {}
}
