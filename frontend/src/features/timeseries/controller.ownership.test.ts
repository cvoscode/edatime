import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { createTimeseriesRuntimeCache } from './runtimeCache.js';
import { createTimeseriesPageController } from './controller.js';

function fixture() {
    const workspace = createWorkspaceStore();
    const metadata = {
        columns: [{ name: 'value', dtype: 'Float64' }], numeric_columns: ['value'],
        time_column: 'ts', time_range: { min: 1, max: 10 }, total_rows: 2, column_profiles: [],
    };
    workspace.commitDataset(workspace.beginDatasetSession(), metadata, 1);
    workspace.setSelection(['value']);
    workspace.setViewport({ xMin: 1, xMax: 10, yMin: null, yMax: null });
    let resolve!: (value: unknown) => void;
    const fetchData = vi.fn(() => new Promise(done => { resolve = done; }));
    const runtimeCache = createTimeseriesRuntimeCache();
    const controller = createTimeseriesPageController({
        workspace, runtimeCache, fetchData,
        buildRangeControls: vi.fn(), updateAnalysisYRange: vi.fn(), updateAnalysisZoom: vi.fn(),
        getCurrentView: () => workspace.getSnapshot().viewport!,
        fetchAndRenderAnalytics: vi.fn(async () => {}),
    });
    const finish = () => resolve({ ts: Float64Array.of(1, 10), values: { value: Float64Array.of(1, 2) } });
    return { workspace, metadata, fetchData, runtimeCache, controller, finish };
}

describe('Timeseries dataset ownership', () => {
    it('aborts and ignores old responses when a replacement has identical columns and bounds', async () => {
        const f = fixture();
        const pending = f.controller.fetchAndRender();
        expect(f.fetchData).toHaveBeenCalledOnce();
        const signal = (f.fetchData.mock.calls[0] as unknown as unknown[])[6] as { signal: AbortSignal };
        f.workspace.commitDataset(f.workspace.beginDatasetSession(), f.metadata, 2);
        expect(signal.signal.aborted).toBe(true);
        f.finish(); // Simulate a transport that resolves despite cancellation.
        await pending;
        expect(f.runtimeCache.data).toBeNull();
        expect(f.controller.getZoomHistory()).toEqual([]);
        f.controller.dispose();
    });

    it('does not publish a late response or start new work after feature disposal', async () => {
        const f = fixture();
        const pending = f.controller.fetchAndRender();
        f.controller.dispose();
        f.finish();
        await pending;
        await f.controller.fetchAndRender();
        expect(f.runtimeCache.data).toBeNull();
        expect(f.fetchData).toHaveBeenCalledOnce();
        f.workspace.dispose();
    });
});
