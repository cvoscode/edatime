import { describe, expect, it, vi } from 'vitest';
import { createTimeseriesEntrypoint } from './entrypoint.js';

describe('createTimeseriesEntrypoint', () => {
    it('rebuilds column toggles and range controls through one feature surface', async () => {
        const feature = createTimeseriesEntrypoint({
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
        } as any);
        feature.rebuildColumns();
        expect(feature.buildRangeControls).toBeTypeOf('function');
    });

    it('returns init, rebuildColumns, and buildRangeControls', () => {
        const feature = createTimeseriesEntrypoint({
            fetchAndRender: vi.fn(),
            renderCurrentData: vi.fn(),
            updateAnalysisYRange: vi.fn(),
        } as any);
        expect(feature.init).toBeTypeOf('function');
        expect(feature.rebuildColumns).toBeTypeOf('function');
        expect(feature.buildRangeControls).toBeTypeOf('function');
    });
});