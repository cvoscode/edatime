import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chartState, setChartInstance, setChartText } from '../store/index.js';
import { initChartTextControls } from './chartTextControls.js';

describe('chartTextControls', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="chart-title-input" />
            <input id="x-axis-label-input" />
            <input id="y-axis-label-input" />
        `;
        setChartInstance(null);
        setChartText({ title: '', xLabel: '', yLabel: '' });
    });

    it('reads and writes chart text through chartState without appStateCompat', () => {
        const setChartTextOnChart = vi.fn();
        setChartInstance({ setChartText: setChartTextOnChart } as any);
        setChartText({ title: 'Existing title', xLabel: 'Existing X', yLabel: 'Existing Y' });

        initChartTextControls();

        const title = document.getElementById('chart-title-input') as HTMLInputElement;
        const xLabel = document.getElementById('x-axis-label-input') as HTMLInputElement;
        const yLabel = document.getElementById('y-axis-label-input') as HTMLInputElement;

        expect(title.value).toBe('Existing title');
        expect(xLabel.value).toBe('Existing X');
        expect(yLabel.value).toBe('Existing Y');

        title.value = 'Updated title';
        title.dispatchEvent(new Event('input'));

        expect(chartState.chartText).toEqual({
            title: 'Updated title',
            xLabel: 'Existing X',
            yLabel: 'Existing Y',
        });
        expect(setChartTextOnChart).toHaveBeenLastCalledWith('Updated title', 'Existing X', 'Existing Y');
    });
});
