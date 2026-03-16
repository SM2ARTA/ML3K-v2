/**
 * LP Plan Engine — bin-packing algorithm for truck loading
 * Ported from v1 LP_buildLoadPlan()
 *
 * This is a simplified version that generates the plan from demand + arrivals.
 * The full v1 engine has ~150 lines of dense logic including:
 * - Greedy bin-packing by destination priority
 * - Stock allocation with proportional ratios
 * - Date-based inventory tracking
 * - Flush phase for remaining demand
 * - RIC start date enforcement
 * - Hold/exclude filtering
 *
 * For now, we use the v1 engine output stored in the database (migrated via 002_migrate_data.sql).
 * Full engine port is planned for Phase 4 when we need to regenerate plans from v2.
 */

import { isNonWorkday, addDays, nextWorkday, matchTransitAbbr } from './lp-helpers';

interface PlanConfig {
	maxPallets: number;
	maxTrucks: number;
	maxDests: number;
	ricStartDate: string;
	nomenclature: Record<string, any>;
	stockSkus?: string[];
	holds?: string[];
	excludeStaples?: boolean;
}

/**
 * Placeholder: returns the existing plan from the database.
 * The actual plan generation should be triggered from v1 until the engine is fully ported.
 *
 * To regenerate plans, users should:
 * 1. Use the v1 app (sm2arta.github.io/LM-3000) to upload files and generate
 * 2. Run the data migration (002_migrate_data.sql) to sync to v2 tables
 * 3. Or wait for the full engine port in Phase 4
 */
export function buildLoadPlan(demand: any[], arrivals: any[], cfg: PlanConfig): any[] {
	// TODO: Port full LP_buildLoadPlan() from v1
	// For now, this is a stub that returns empty — plan data comes from database
	console.warn('LP Engine: Full plan generation not yet ported to v2. Use v1 to generate plans.');
	return [];
}

/** Calculate arrival date from dispatch date + transit days */
export function getArrivalDate(dispatchDate: string, destination: string, transitDays: Record<string, number>): string {
	const abbr = matchTransitAbbr(destination);
	const days = transitDays[abbr] || 3;
	return addDays(dispatchDate, days);
}

/** Get transit days for a destination */
export function getTransitDays(destination: string, transitDays: Record<string, number>): number {
	const abbr = matchTransitAbbr(destination);
	return transitDays[abbr] || 3;
}
