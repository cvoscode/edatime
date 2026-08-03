import { bench, describe } from 'vitest';

import { createWorkspaceStore } from './workspaceStore.js';

function makeAdaptiveFilters(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        id: `filter-${index}`,
        column: 'value',
        x1: index,
        y1: index,
        x2: index + 1,
        y2: index + 1,
        keepAbove: index % 2 === 0,
    }));
}

function createMeasuredStore(filterCount: number, listenerCount: number) {
    const store = createWorkspaceStore();
    store.setFilters({ columnRanges: {}, adaptiveLines: makeAdaptiveFilters(filterCount) });
    for (let index = 0; index < listenerCount; index++) {
        store.subscribeSelector((snapshot) => snapshot.filters.adaptiveLines.length, () => {});
    }
    return store;
}

describe('workspace publication', () => {
    for (const filterCount of [0, 10, 100, 1_000]) {
        for (const listenerCount of [1, 10, 100]) {
            const store = createMeasuredStore(filterCount, listenerCount);
            let toggle = false;
            bench(`${filterCount} filters / ${listenerCount} filter listeners: viewport update`, () => {
                toggle = !toggle;
                store.setViewport({
                    xMin: toggle ? 0 : 1,
                    xMax: toggle ? 1 : 2,
                    yMin: 0,
                    yMax: 1,
                });
            });
        }
    }
});
