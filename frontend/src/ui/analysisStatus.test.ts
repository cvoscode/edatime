import { beforeEach, describe, expect, it } from 'vitest';

import { setChartInstance } from '../store/chartState.js';
import { updateAnalysisYRange } from './analysisStatus.js';

describe('analysisStatus', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="analysis-y"></div>';
        setChartInstance(null);
    });

    it('renders the explicitly supplied restored Y range', () => {
        updateAnalysisYRange(10, 20, 'restore');

        expect(document.getElementById('analysis-y')?.textContent).toContain('(restore)');
    });
});
