/** Destination color coding — matches v1 LP_destColor() */
const DEST_COLORS: Record<string, { bg: string; color: string; border: string }> = {
	// Canada — blue
	'Toronto': { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
	'Vancouver': { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
	// Mexico — orange
	'Mexico City': { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
	'Guadalajara': { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
	'Monterrey': { bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
	// USA — green
	'Houston': { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
	'Kansas City': { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
	'New York New Jersey': { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
};
const DEFAULT_COLOR = { bg: 'var(--bg)', color: 'var(--ts)', border: 'var(--bd)' };

export function destColor(dest: string) {
	// Try exact match, then partial
	if (DEST_COLORS[dest]) return DEST_COLORS[dest];
	for (const [k, v] of Object.entries(DEST_COLORS)) {
		if (dest.includes(k) || k.includes(dest)) return v;
	}
	return DEFAULT_COLOR;
}

/** Clean destination display name — strip /CORT, /RIC suffixes */
export function cleanDest(raw: string): string {
	return raw.replace(/\s*\/\s*(CORT|RIC)\s*$/i, '').trim();
}

/** Abbreviate destination for compact display */
export function destAbbr(dest: string): string {
	const clean = cleanDest(dest);
	const words = clean.split(' ');
	if (words.length === 1) return clean.slice(0, 3);
	return words.map(w => w.slice(0, 3)).join(' ');
}

/** Format date for display */
export function fmtDate(d: string | null): string {
	if (!d) return '—';
	try {
		const dt = new Date(d + 'T00:00:00');
		return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	} catch { return d; }
}

/** Country grouping for LP destinations */
export const DEST_GROUPS = {
	can: ['Toronto', 'Vancouver'],
	mex: ['Mexico City', 'Guadalajara', 'Monterrey'],
	usa: ['Houston', 'Kansas City', 'New York New Jersey']
};
