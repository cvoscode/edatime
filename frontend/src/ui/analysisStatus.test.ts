import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chartState, setChartInstance } from '../store/chartState.js';
import { setPendingRestoreY, setPendingYMode } from '../store/runtimeState.js';
import { updateAnalysisYRange } from './analysisStatus.js';

describe('analysisStatus', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="analysis-y"></div>';
        setChartInstance(null);
        setPendingYMode(null);
        setPendingRestoreY(null);
    });

    it('restores the pending Y range from runtime state without using appStateCompat', () => {
        const setYRange = vi.fn();
        setChartInstance({ setYRange } as any);
        setPendingYMode('restore');
        setPendingRestoreY({ min: 10, max: 20 });

        updateAnalysisYRange(1, 2, 'data');

        expect(setYRange).toHaveBeenCalledWith(10, 20);
        expect(chartState.chart).toBeTruthy();
        expect(document.getElementById('analysis-y')?.textContent).toContain('(restore)');
    });
});
