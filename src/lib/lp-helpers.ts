/** LP date helpers and utilities — ported from v1 */

export function parseLocalDate(s: string): Date | null {
	if (!s || s === '—') return null;
	const [y, m, d] = String(s).split('-').map(Number);
	return new Date(y, m - 1, d, 12, 0, 0);
}

export function fmtDate(d: Date | string | null): string {
	if (!d) return '—';
	const dt = d instanceof Date ? d : parseLocalDate(String(d));
	if (!dt || isNaN(dt.getTime())) return String(d);
	const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function addDays(s: string, n: number): string {
	const d = parseLocalDate(s);
	if (!d) return s;
	d.setDate(d.getDate() + n);
	return fmtDate(d);
}

export function isWeekend(s: string): boolean {
	const d = parseLocalDate(s);
	return d ? d.getDay() === 0 || d.getDay() === 6 : false;
}

const US_HOLIDAYS = new Set([
	'2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
	'2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25'
]);

export function isHoliday(s: string): boolean { return US_HOLIDAYS.has(s); }
export function isNonWorkday(s: string): boolean { return isWeekend(s) || isHoliday(s); }
export function nextWorkday(s: string): string { let d = s; while (isNonWorkday(d)) d = addDays(d, 1); return d; }

export function parseExcelDate(v: any): string | null {
	if (!v) return null;
	if (v instanceof Date) {
		const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	if (typeof v === 'number') {
		const utc = new Date(Math.round((v - 25569) * 86400 * 1000));
		const y = utc.getUTCFullYear(), m = String(utc.getUTCMonth() + 1).padStart(2, '0'), d = String(utc.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const s = String(v).trim();
	// YYYY-MM-DD
	const mt = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
	if (mt) return `${mt[1]}-${String(mt[2]).padStart(2, '0')}-${String(mt[3]).padStart(2, '0')}`;
	// DD.MM.YYYY (European)
	const eu = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
	if (eu) return `${eu[3]}-${String(eu[2]).padStart(2, '0')}-${String(eu[1]).padStart(2, '0')}`;
	return null;
}

export function makeGC(headers: string[]) {
	return function (...keys: string[]): number {
		for (const k of keys) { const i = headers.findIndex(h => h === k); if (i >= 0) return i; }
		for (const k of keys) { const i = headers.findIndex(h => h.includes(k)); if (i >= 0) return i; }
		return -1;
	};
}

const TRANSIT_ABBR: Record<string, string[]> = {
	TOR: ['toronto'], VAN: ['vancouver'],
	CDMX: ['mexico city', 'cdmx'], GDL: ['guadalajara'], MTY: ['monterrey'],
	KC: ['kansas city', 'kansas'], HOU: ['houston'], NY: ['new york', 'new jersey', 'ny/nj']
};

export function matchTransitAbbr(dest: string): string {
	const u = (dest || '').toUpperCase();
	for (const [abbr, names] of Object.entries(TRANSIT_ABBR)) {
		if (u.includes(abbr)) return abbr;
		for (const n of names) if (u.includes(n.toUpperCase())) return abbr;
	}
	return '';
}
