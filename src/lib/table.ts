/**
 * TanStack Table adapter for Svelte 5
 * Uses @tanstack/table-core with Svelte's $state for reactivity
 */
import {
	createTable,
	type TableOptions,
	type RowData,
	type TableOptionsResolved
} from '@tanstack/table-core';

export function createSvelteTable<TData extends RowData>(options: TableOptions<TData>) {
	const resolvedOptions: TableOptionsResolved<TData> = {
		state: {},
		onStateChange() {},
		renderFallbackValue: null,
		...options
	};

	const table = createTable(resolvedOptions);
	let tableState = $state(table.initialState);

	function updateOptions(newOptions: TableOptions<TData>) {
		table.setOptions((prev) => ({
			...prev,
			...newOptions,
			state: { ...tableState, ...newOptions.state },
			onStateChange: (updater: any) => {
				if (typeof updater === 'function') {
					tableState = updater(tableState);
				} else {
					tableState = updater;
				}
			}
		}));
	}

	updateOptions(options);

	// Return a proxy that always reflects the latest state
	return {
		get table() {
			updateOptions(options);
			return table;
		},
		get state() {
			return tableState;
		}
	};
}

export type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/table-core';
