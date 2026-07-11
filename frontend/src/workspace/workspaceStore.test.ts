import { describe, expect, it, vi } from 'vitest';

import { createWorkspaceStore, makeWorkspaceSnapshot } from './workspaceStore.js';

describe('workspace store', () => {
    it('builds complete cloned snapshots from concise test fixtures', () => {
        const snapshot = makeWorkspaceSnapshot({
            selection: { columns: ['value'], colorColumn: 'bucket' },
            filters: { columnRanges: { value: { from: 1, to: 2 } } },
        });
        (snapshot.selection.columns as string[]).push('mutated');

        expect(makeWorkspaceSnapshot({ selection: { columns: ['value'] } }).selection.columns).toEqual(['value']);
        expect(snapshot).toMatchObject({
            dataset: { metadata: null, revision: 0 },
            selection: { colorColumn: 'bucket' },
            filters: { columnRanges: { value: { from: 1, to: 2 } }, adaptiveLines: [] },
            viewport: null,
        });
    });

    it('keeps state instance-scoped and returns immutable snapshots', () => {
        const first = createWorkspaceStore();
        const second = createWorkspaceStore();
        first.setSelection([' value ', 'value', 'other'], 'group');

        const snapshot = first.getSnapshot();
        (snapshot.selection.columns as string[]).push('mutated');

        expect(first.getSnapshot().selection).toEqual({ columns: ['value', 'other'], colorColumn: 'group' });
        expect(second.getSnapshot().selection).toEqual({ columns: [], colorColumn: null });
    });

    it('aborts a replaced dataset session and rejects stale dataset commits', () => {
        const store = createWorkspaceStore();
        const first = store.beginDatasetSession();
        const second = store.beginDatasetSession();
        const metadata = { revision: 2, columns: [] } as any;

        expect(first.signal.aborted).toBe(true);
        expect(store.commitDataset(first, metadata, 1)).toBe(false);
        expect(store.commitDataset(second, metadata, 2)).toBe(true);
        expect(store.getSnapshot().dataset.revision).toBe(2);
    });

    it('publishes cloned snapshots for state changes and stops after disposal', () => {
        const store = createWorkspaceStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.setFilters({
            columnRanges: { value: { min: 1, max: 2 } } as any,
            adaptiveLines: [],
        });

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            filters: expect.objectContaining({ columnRanges: { value: { min: 1, max: 2 } } }),
        }));

        store.dispose();
        store.setViewport({ xMin: 0, xMax: 1 } as any);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
