import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chartState, setChartInstance } from '../store/chartState.js';
import { setAnalysisBound } from '../store/runtimeState.js';
import { bindAnalysisChartEvents } from './toolbar.js';

describe('toolbar', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="analysis-cursor"></div>
            <div id="analysis-click"></div>
        `;
        setAnalysisBound(false);
        setChartInstance(null);
    });

    it('binds analysis chart events through chartState/runtimeState without appStateCompat', () => {
        let crosshairHandler: ((payload: any) => void) | undefined;
        let clickHandler: ((payload: any) => void) | undefined;
        setChartInstance({
            onCrosshairMove: vi.fn((handler: (payload: any) => void) => { crosshairHandler = handler; }),
            onClick: vi.fn((handler: (payload: any) => void) => { clickHandler = handler; }),
            getXDomain: vi.fn(() => ({ min: 1000, max: 2000 })),
            getYRange: vi.fn(() => ({ min: 0, max: 10 })),
        } as any);

        bindAnalysisChartEvents();

        expect(chartState.chart).toBeTruthy();
        expect(crosshairHandler).toBeTypeOf('function');
        expect(clickHandler).toBeTypeOf('function');

        crosshairHandler?.({ x: 15 });
        clickHandler?.({ value: [20, 7], seriesName: 'value' });

        expect(document.getElementById('analysis-cursor')?.textContent).toContain('1970');
        expect(document.getElementById('analysis-click')?.textContent).toContain('[value]');
    });
});
