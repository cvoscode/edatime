import { describe, expect, it, vi } from 'vitest';

import { confirmDatasetReplacement } from './datasetReplacement.js';

function workspace(totalRows: number) {
    return {
        getSnapshot: () => ({
            dataset: { metadata: totalRows ? { total_rows: totalRows, source_name: 'weather.csv' } : null },
            selection: { columns: ['temperature', 'humidity'] },
            filters: { columnRanges: { temperature: { from: 0, to: 10 } }, adaptiveLines: [] },
        }),
    } as any;
}

describe('confirmDatasetReplacement', () => {
    it('does not prompt for the first dataset', () => {
        const confirmAction = vi.fn(() => false);
        expect(confirmDatasetReplacement(workspace(0), 'incoming.csv', confirmAction)).toBe(true);
        expect(confirmAction).not.toHaveBeenCalled();
    });

    it('names both datasets and relevant state before replacement', () => {
        const confirmAction = vi.fn(() => true);
        expect(confirmDatasetReplacement(workspace(42), 'incoming.csv', confirmAction)).toBe(true);
        expect(confirmAction).toHaveBeenCalledWith(expect.stringMatching(/weather\.csv.*incoming\.csv.*2 selected series.*1 active filter/));
    });
});
