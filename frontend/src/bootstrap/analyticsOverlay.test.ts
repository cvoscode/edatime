import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAnomalyRegions } from './analyticsOverlay.js';
import { analyticsState } from '../store/analyticsState.js';
import { chartState, setViewport } from '../store/chartState.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';

describe('fetchAnomalyRegions', () => {
    afterEach(() => {
        analyticsState.anomalyEnabled = false;
        setViewport(null, null);
    });

    it('builds anomaly requests from canonical workspace selection', async () => {
        const workspace = createWorkspaceStore();
        workspace.setSelection(['workspace-series']);
        analyticsState.anomalyEnabled = true;
        setViewport(1, 2);
        const fetchAnomalies = vi.fn().mockResolvedValue({ regions: [], summary_stats: null });

        await fetchAnomalyRegions(fetchAnomalies, workspace);

        expect(fetchAnomalies).toHaveBeenCalledWith(
            new Date(1).toISOString(),
            new Date(2).toISOString(),
            'workspace-series',
            analyticsState.anomalyMethod,
            analyticsState.anomalyThreshold,
            { signal: expect.any(AbortSignal) },
        );
    });
});
