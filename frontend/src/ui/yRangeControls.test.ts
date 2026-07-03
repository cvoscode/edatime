import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setChartInstance } from '../store/index.js';
import { initYRangeControls } from './yRangeControls.js';

function buildDom(): void {
    document.body.innerHTML = `
        <span id="y-range-help" class="toolbar-info-icon" data-info-tip="Stack from 0 clamps the display floor at zero.&#10;Percentile hides the top and bottom tails by the selected percent.&#10;IQR expands from Q1/Q3 by k × IQR."></span>
        <input id="y-stack-from-zero" type="checkbox" />
        <input id="y-robust-range-toggle" type="checkbox" />
        <select id="y-robust-range-mode">
            <option value="percentile" selected>Percentile</option>
            <option value="iqr">IQR</option>
        </select>
        <input id="y-robust-range-param" type="number" value="1" />
        <span id="y-range-hint" hidden></span>
    `;
}

describe('initYRangeControls', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        buildDom();
        setChartInstance(null);
    });

    it('applies robust y-range settings to the chart without persisting them', () => {
        const setStackFromZero = vi.fn();
        const setRobustDisplayRange = vi.fn();
        const resize = vi.fn();
        setChartInstance({
            setStackFromZero,
            setRobustDisplayRange,
            resize,
        } as any);

        initYRangeControls();

        const toggle = document.getElementById('y-robust-range-toggle') as HTMLInputElement;
        const mode = document.getElementById('y-robust-range-mode') as HTMLSelectElement;
        const param = document.getElementById('y-robust-range-param') as HTMLInputElement;

        toggle.checked = true;
        mode.value = 'iqr';
        param.value = '1.5';
        toggle.dispatchEvent(new Event('change'));

        expect(setRobustDisplayRange).toHaveBeenLastCalledWith({ mode: 'iqr', param: 1.5 });

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));

        expect(setRobustDisplayRange).toHaveBeenLastCalledWith(null);
    });

    it('exposes y-range help text and a spike-compression hint when suggested by the chart', () => {
        setChartInstance({
            setStackFromZero: vi.fn(),
            setRobustDisplayRange: vi.fn(),
            resize: vi.fn(),
            getRobustDisplayRangeSuggestion: () => ({ mode: 'percentile', param: 1 }),
        } as any);

        initYRangeControls();

        expect(document.getElementById('y-range-help')?.getAttribute('data-info-tip'))
            .toContain('Percentile hides the top and bottom tails');
        expect(document.getElementById('y-range-hint')?.hidden).toBe(false);
        expect(document.getElementById('y-range-hint')?.textContent).toBe('Spike-compressed view detected. Try Robust range.');
    });
});
