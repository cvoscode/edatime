import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    computeFrontendRollingBands,
    createAnalyticsOverlayController,
    initAnalyticsListeners,
} from './analyticsOverlay.js';
import { analyticsState } from '../../store/analyticsState.js';
import { getColumnSeriesColor, setSeriesColor } from '../../utils/seriesColors.js';
import { setSeriesColors } from '../../store/uiState.js';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { emitFeatureEvent } from '../../platform/featureEvents.js';
import type { ApiRequestOptions } from '../../services/api/http.js';
import type { AnomalyResponse } from '../../types/api.js';

describe('fetchAnomalyRegions', () => {
    afterEach(() => {
        analyticsState.anomalyEnabled = false;
    });

    it('builds anomaly requests from canonical workspace selection', async () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['workspace-series']);
        analyticsState.anomalyEnabled = true;
        workspace.setViewport({ xMin: 1, xMax: 2, yMin: null, yMax: null });
        const fetchAnomalies = vi.fn().mockResolvedValue({ regions: [], summary_stats: null });

        const overlay = createAnalyticsOverlayController();
        await overlay.fetchAnomalyRegions(fetchAnomalies, workspace);

        expect(fetchAnomalies).toHaveBeenCalledWith(
            new Date(1).toISOString(),
            new Date(2).toISOString(),
            'workspace-series',
            analyticsState.anomalyMethod,
            analyticsState.anomalyThreshold,
            { signal: expect.any(AbortSignal) },
        );
    });

    it('uses the column chip color for hulls without depending on selection order', () => {
        setSeriesColors({});
        setSeriesColor('HULL', '#abcdef');
        const bands = computeFrontendRollingBands({
            ts: new Float64Array([0, 1, 2]),
            series: {
                HULL: { x: new Float64Array([0, 1, 2]), y: new Float64Array([1, 2, 3]) },
            },
        }, ['HULL'], 3);

        expect(bands[0]?.color).toBe('#abcdef');
        expect(bands[0]?.color).toBe(getColumnSeriesColor('HULL'));
        setSeriesColors({});
    });

    it('refreshes analytics when the typed analytics-change event fires', async () => {
        const workspace = createWorkspaceStore();
        const fetchAndRenderAnalytics = vi.fn().mockResolvedValue(undefined);
        const dispose = initAnalyticsListeners(fetchAndRenderAnalytics, workspace, () => null);

        emitFeatureEvent('analytics:change', undefined);
        await Promise.resolve();
        dispose();

        expect(fetchAndRenderAnalytics).toHaveBeenCalledTimes(1);
    });

    it('keeps anomaly requests and redraw callbacks isolated per overlay controller', async () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['workspace-series']);
        analyticsState.anomalyEnabled = true;
        workspace.setViewport({ xMin: 1, xMax: 2, yMin: null, yMax: null });
        let resolveFirst!: (value: AnomalyResponse) => void;
        let firstSignal!: AbortSignal;
        const firstFetch = vi.fn<(
            start: string,
            end: string,
            columns: string,
            method?: string,
            threshold?: number,
            options?: ApiRequestOptions,
        ) => Promise<AnomalyResponse>>((_start, _end, _columns, _method, _threshold, options) => {
            firstSignal = options!.signal!;
            return new Promise((resolve) => { resolveFirst = resolve; });
        });
        const secondFetch = vi.fn().mockResolvedValue({ regions: [], summary_stats: null });
        const first = createAnalyticsOverlayController();
        const second = createAnalyticsOverlayController();
        const firstRedraw = vi.fn();
        const secondRedraw = vi.fn();
        first.setRenderCallback(firstRedraw);
        second.setRenderCallback(secondRedraw);

        const firstPending = first.fetchAnomalyRegions(firstFetch, workspace);
        await Promise.resolve();
        await second.fetchAnomalyRegions(secondFetch, workspace);

        expect(firstSignal.aborted).toBe(false);
        expect(secondRedraw).toHaveBeenCalledTimes(1);
        expect(firstRedraw).not.toHaveBeenCalled();

        resolveFirst({
            regions: [],
            summary_stats: null,
            method: analyticsState.anomalyMethod,
            threshold: analyticsState.anomalyThreshold,
        });
        await firstPending;

        expect(firstRedraw).toHaveBeenCalledTimes(1);
        first.dispose();
        second.dispose();
    });
});
