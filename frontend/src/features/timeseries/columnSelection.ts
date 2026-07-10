/**
 * features/timeseries/columnSelection — selected-column sanitization and adaptive-target fallback.
 *
 * Extracted from columnsController so the chip-list builder stays focused on
 * presentation and event wiring, while selection logic lives here.
 */
import {
    appStateComposite as appState,
    setAdaptiveFilterColumn,
} from '../../store/index.js';
import { getTimeseriesSelection, setTimeseriesSelection, type SelectionWorkspace } from './selectionIntent.js';

/**
 * Remove selected columns that are blocked, temporal, or no longer present in metadata.
 * Called at the start of buildColumnToggles to keep the selection valid.
 */
export function sanitizeSelectedColumns(workspace: SelectionWorkspace): void {
    const blockedNames = new Set(['ts', 'timestamp', 'time']);
    const datetimeCols = new Set(
        (appState.metadata?.columns ?? [])
            .filter((col) => /date|time/i.test(String(col?.dtype ?? '')))
            .map((col) => String(col?.name ?? '').toLowerCase()),
    );
    const validColNames = new Set(
        (appState.metadata?.columns ?? []).map((col) => String(col?.name ?? '').trim()),
    );

    setTimeseriesSelection(
        workspace,
        getTimeseriesSelection(workspace).filter((col) => {
            const name = String(col ?? '').trim();
            if (!name) return false;
            const lower = name.toLowerCase();
            if (blockedNames.has(lower) || datetimeCols.has(lower)) return false;
            return validColNames.has(name);
        }),
    );
}

/**
 * Ensure the current adaptive-filter target is still a valid selected column.
 * If the target column is no longer selected, fall back to the first selected column.
 * Called after sanitizeSelectedColumns inside buildColumnToggles.
 */
export function ensureAdaptiveTargetStillValid(workspace: SelectionWorkspace): void {
    if (!appState.adaptiveFilterColumn) return;
    const selection = getTimeseriesSelection(workspace);
    if (selection.includes(appState.adaptiveFilterColumn)) return;
    setAdaptiveFilterColumn(selection[0] ?? null);
}
