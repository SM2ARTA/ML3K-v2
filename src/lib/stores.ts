import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Auth — persists to localStorage
function createPersistentStore<T>(key: string, initial: T) {
	const stored = browser ? localStorage.getItem(key) : null;
	const store = writable<T>(stored ? JSON.parse(stored) : initial);
	if (browser) {
		store.subscribe(value => localStorage.setItem(key, JSON.stringify(value)));
	}
	return store;
}

export const role = createPersistentStore<'admin' | 'viewer' | ''>('ml3k-role', '');
export const connected = writable(false);

// Active module — persists
export const activeModule = createPersistentStore<'v26' | 'lp' | 'lm'>('ml3k-module', 'lm');

// LP State
export const lpState = writable({
	nomenclature: {} as Record<string, any>,
	materialPlan: [] as any[],
	arrivals: [] as any[],
	generatedPlan: [] as any[],
	planGenerated: false,
	turnaround: 6,
	maxPallets: 26,
	maxTrucks: 4,
	maxDests: 3,
	ricStartDate: '2026-04-01',
	lockedRows: [] as number[]
});

// LP Truck State (persisted separately)
export const lpTruckState = writable({
	dispatched: new Set<number>(),
	contDateOverrides: {} as Record<string, string>,
	lsrNumbers: {} as Record<number, string>,
	palletOverrides: {} as Record<string, any>,
	customsOverrides: {} as Record<string, any>,
	excludeStaples: true,
	arrivedConts: new Set<string>(),
	transitDays: { TOR: 7, VAN: 7, CDMX: 7, GDL: 7, MTY: 7, KC: 1, HOU: 1, NY: 3 } as Record<string, number>,
	destWhsDays: { TOR: 3, VAN: 3, CDMX: 3, GDL: 3, MTY: 3, KC: 3, HOU: 3, NY: 3 } as Record<string, number>,
	holds: new Set<string>(),
	stockSkus: new Set<string>(),
	stockReportName: ''
});
