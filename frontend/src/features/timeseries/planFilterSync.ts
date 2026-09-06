import type { AdaptiveLineFilter } from '../../types/store.js';
import type { CleaningPlan } from '../../cleaning/types.js';
import type { WorkspaceStore } from '../../contracts/workspace.js';

/**
 * Mirrors plan-backed Signals ranges into workspace intent.
 *
 * The plan is the durable/server-side source of truth, while workspace intent
 * drives the visible Signals chips and client-side render mask. Only keys this
 * synchronizer previously managed are removed, so unrelated feature filters
 * keep their ownership.
 */
export function createTimeseriesPlanFilterSync(
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>,
): (plan: CleaningPlan | null) => void {
    let managedColumns = new Set<string>();
    let managedLines = new Set<string>();

    return (plan) => {
        const lines: AdaptiveLineFilter[] = [];
        const ranges = new Map<string, { from: number; to: number }>();
        for (const stage of plan?.stages ?? []) {
            if (stage.enabled && stage.sourcePage === 'timeseries' && stage.kind === 'adaptiveLine' && stage.applyWithinSegmentOnly) {
                lines.push({ id: stage.id, column: stage.column, x1: stage.x1Ms, y1: stage.y1,
                    x2: stage.x2Ms, y2: stage.y2, keepAbove: stage.keepAbove });
            }
            if (!stage.enabled || stage.sourcePage !== 'timeseries' || stage.kind !== 'columnRange'
                || stage.mode !== 'keepInside' || !stage.column.trim()
                || !Number.isFinite(stage.from) || !Number.isFinite(stage.to)) continue;
            ranges.set(stage.column.trim(), {
                from: Math.min(stage.from, stage.to),
                to: Math.max(stage.from, stage.to),
            });
        }

        const filters = workspace.getSnapshot().filters;
        const columnRanges = { ...filters.columnRanges };
        for (const column of managedColumns) delete columnRanges[column];
        for (const [column, range] of ranges) columnRanges[column] = range;
        managedColumns = new Set(ranges.keys());
        const adaptiveLines = [...filters.adaptiveLines.filter((line) => !managedLines.has(line.id)), ...lines];
        managedLines = new Set(lines.map((line) => line.id));
        workspace.setFilters({ ...filters, columnRanges, adaptiveLines });
    };
}
