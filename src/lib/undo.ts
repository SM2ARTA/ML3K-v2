/**
 * Undo system — captures snapshots before destructive operations
 * Simplified v2 version using Supabase directly
 */
import { supabase } from './supabase';

interface UndoSnapshot {
	timestamp: string;
	tables: Record<string, any[]>;
}

let undoStack: UndoSnapshot[] = [];
const MAX_UNDO = 5;

/** Capture current state of key tables */
export async function captureUndo() {
	try {
		const tables: Record<string, any[]> = {};

		// Capture the tables that change most frequently
		const [plan, dispatch, holds, customs, lmDispatch, lmDemandAdj, lmExcluded] = await Promise.all([
			supabase.from('lp_plan').select('*'),
			supabase.from('lp_truck_dispatch').select('*'),
			supabase.from('lp_holds').select('*'),
			supabase.from('lp_customs_overrides').select('*'),
			supabase.from('lm_dispatch').select('*'),
			supabase.from('lm_demand_adj').select('*'),
			supabase.from('lm_excluded').select('*')
		]);

		if (plan.data) tables['lp_plan'] = plan.data;
		if (dispatch.data) tables['lp_truck_dispatch'] = dispatch.data;
		if (holds.data) tables['lp_holds'] = holds.data;
		if (customs.data) tables['lp_customs_overrides'] = customs.data;
		if (lmDispatch.data) tables['lm_dispatch'] = lmDispatch.data;
		if (lmDemandAdj.data) tables['lm_demand_adj'] = lmDemandAdj.data;
		if (lmExcluded.data) tables['lm_excluded'] = lmExcluded.data;

		undoStack.push({ timestamp: new Date().toISOString(), tables });
		if (undoStack.length > MAX_UNDO) undoStack.shift();
	} catch (e) {
		console.warn('Undo capture failed:', e);
	}
}

/** Restore from the last snapshot */
export async function restoreUndo(): Promise<boolean> {
	const snap = undoStack.pop();
	if (!snap) return false;

	try {
		for (const [table, rows] of Object.entries(snap.tables)) {
			// Clear current data
			const pkMap: Record<string, string> = {
				lp_plan: 'id', lp_holds: 'id', lp_truck_dispatch: 'truck_id', lp_customs_overrides: 'sku',
				lm_dispatch: 'fingerprint', lm_demand_adj: 'venue_sku', lm_excluded: 'item_id'
			};
			const pkCol = pkMap[table] || 'id';
			await supabase.from(table).delete().neq(pkCol, '___never___');

			// Restore snapshot rows in batches
			if (rows.length) {
				const cleaned = rows.map(r => { const c = { ...r }; delete c.created_at; delete c.updated_at; return c; });
				for (let i = 0; i < cleaned.length; i += 500) {
					await supabase.from(table).insert(cleaned.slice(i, i + 500));
				}
			}
		}
		return true;
	} catch (e) {
		console.warn('Undo restore failed:', e);
		return false;
	}
}

/** Check if undo is available */
export function hasUndo(): boolean {
	return undoStack.length > 0;
}

/** Get undo stack size */
export function undoCount(): number {
	return undoStack.length;
}
