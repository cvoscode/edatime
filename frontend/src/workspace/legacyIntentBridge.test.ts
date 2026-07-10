import { afterEach, describe, expect, it } from 'vitest';

import {
    chartState,
    setAdaptiveLineFilters,
    setColumnRanges,
    setSelectedColorColumn,
    setSelectedCols,
    setViewport,
    uiState,
} from '../store/index.js';
import { bridgeLegacyIntent } from './legacyIntentBridge.js';
import { createWorkspaceStore } from './workspaceStore.js';

const initialState = {
    selectedCols: [...uiState.selectedCols],
    selectedColorColumn: uiState.selectedColorColumn,
    columnRanges: { ...uiState.columnRanges },
    adaptiveLineFilters: [...uiState.adaptiveLineFilters],
    start: chartState.currentStart,
    end: chartState.currentEnd,
};

afterEach(() => {
    setSelectedCols(initialState.selectedCols);
    setSelectedColorColumn(initialState.selectedColorColumn);
    setColumnRanges(initialState.columnRanges);
    setAdaptiveLineFilters(initialState.adaptiveLineFilters);
    setViewport(initialState.start, initialState.end);
});

describe('legacy workspace intent bridge', () => {
    it('keeps the workspace snapshot synchronized with shared UI intent', () => {
        const workspace = createWorkspaceStore();
        const bridge = bridgeLegacyIntent(workspace);

        setSelectedCols(['value']);
        setSelectedColorColumn('group');
        setColumnRanges({ value: { from: 1, to: 2 } });
        setAdaptiveLineFilters([{ id: 'line', column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true }]);
        setViewport(10, 20);

        expect(workspace.getSnapshot()).toMatchObject({
            selection: { columns: ['value'], colorColumn: 'group' },
            filters: {
                columnRanges: { value: { from: 1, to: 2 } },
                adaptiveLines: [{ id: 'line' }],
            },
            viewport: { xMin: 10, xMax: 20, yMin: null, yMax: null },
        });
        bridge.dispose();
    });

    it('stops mirroring state after disposal', () => {
        const workspace = createWorkspaceStore();
        const bridge = bridgeLegacyIntent(workspace);
        bridge.dispose();

        setSelectedCols(['ignored']);

        expect(workspace.getSnapshot().selection.columns).not.toContain('ignored');
    });
});
