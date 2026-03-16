/**
 * Real-time subscriptions for multi-admin sync
 * Uses Supabase Realtime to broadcast changes between connected clients
 */
import { supabase } from './supabase';

type ChangeCallback = (payload: { table: string; eventType: string; new: any; old: any }) => void;

let channels: ReturnType<typeof supabase.channel>[] = [];
let listeners: ChangeCallback[] = [];

/** Subscribe to changes on key tables */
export function startRealtime(callback: ChangeCallback) {
	listeners.push(callback);

	const tables = [
		'lp_customs_overrides', 'lp_holds', 'lp_truck_dispatch',
		'lp_plan', 'lp_settings', 'lp_destinations'
	];

	for (const table of tables) {
		const channel = supabase
			.channel(`realtime-${table}`)
			.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
				for (const cb of listeners) {
					cb({ table, eventType: payload.eventType, new: payload.new, old: payload.old });
				}
			})
			.subscribe();
		channels.push(channel);
	}
}

/** Stop all subscriptions */
export function stopRealtime() {
	for (const ch of channels) {
		supabase.removeChannel(ch);
	}
	channels = [];
	listeners = [];
}

/** Check if realtime is connected */
export function isRealtimeActive(): boolean {
	return channels.length > 0;
}
