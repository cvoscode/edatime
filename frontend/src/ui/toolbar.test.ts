import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chartState, setChartInstance } from '../store/chartState.js';
import { setAnalysisBound } from '../store/runtimeState.js';
import { bindAnalysisChartEvents, initAnalysisControls } from './toolbar.js';

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

    it('routes toolbar zoom commands to the composed page actions', () => {
        document.body.innerHTML += `
            <button id="zoom-out-btn" type="button">Zoom out</button>
            <button id="zoom-reset-btn" type="button">Reset zoom</button>
            <span id="zoom-range-badge"></span>
        `;
        const zoomOutAction = vi.fn();
        const resetZoomAction = vi.fn();
        const workspace = {
            getSnapshot: vi.fn(),
            setFilters: vi.fn(),
            setViewport: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
        };
        setChartInstance({ supportsZoomControls: () => true } as any);

        initAnalysisControls(vi.fn(), zoomOutAction, resetZoomAction, workspace);
        (document.getElementById('zoom-out-btn') as HTMLButtonElement).click();
        (document.getElementById('zoom-reset-btn') as HTMLButtonElement).click();

        expect(zoomOutAction).toHaveBeenCalledTimes(1);
        expect(resetZoomAction).toHaveBeenCalledTimes(1);
    });
});
