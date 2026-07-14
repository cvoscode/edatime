import type { WorkspaceStore } from '../contracts/workspace.js';
import { compileCleaningPlanForLegacyFilters } from './compiler.js';
import type { CleaningPlanStore } from './store.js';

/**
 * Temporary bridge for rendering paths that still read workspace filters.
 * It never writes back into the plan, so the cleaning plan remains canonical.
 */
export function bindCleaningPlanCompatibility(
    planStore: Pick<CleaningPlanStore, 'getSnapshot' | 'subscribe'>,
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'setFilters'>,
): () => void {
    const sync = () => {
        const plan = planStore.getSnapshot();
        if (!plan) return;
        const compiled = compileCleaningPlanForLegacyFilters(plan);
        // Never show an incomplete local approximation as the active plan.
        // Plan-aware backend routes must handle advanced stages first.
        if (compiled.unsupportedForLegacyFilters.length > 0) return;

        const columnRanges: Record<string, { from: number; to: number }> = {};
        for (const filter of compiled.filters) {
            const current = columnRanges[filter.column];
            columnRanges[filter.column] = current
                ? { from: Math.max(current.from, filter.from), to: Math.min(current.to, filter.to) }
                : { from: filter.from, to: filter.to };
        }
        const next = { columnRanges, adaptiveLines: compiled.lineFilters.map((filter, index) => ({
            id: `plan-line-${index}`,
            column: filter.column,
            x1: filter.x1,
            y1: filter.y1,
            x2: filter.x2,
            y2: filter.y2,
            keepAbove: filter.keepAbove,
        })) };
        const current = workspace.getSnapshot().filters;
        if (JSON.stringify(current) !== JSON.stringify(next)) workspace.setFilters(next);
    };

    sync();
    return planStore.subscribe(sync);
}
