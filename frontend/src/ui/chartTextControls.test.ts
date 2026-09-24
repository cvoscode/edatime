import { beforeEach, describe, expect, it, vi } from 'vitest';

import { primaryChart, setPrimaryChartInstance as setChartInstance } from '../charts/primaryChart.js';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
let workspace = createWorkspaceStore();
const setChartText = (chartText: { title: string; xLabel: string; yLabel: string }) => workspace.setAppearance({ chartText });
import { initChartTextControls } from './chartTextControls.js';

describe('chartTextControls', () => {
    beforeEach(() => {
        workspace = createWorkspaceStore();
        document.body.innerHTML = `
            <input id="chart-title-input" />
            <input id="x-axis-label-input" />
            <input id="y-axis-label-input" />
        `;
        setChartInstance(null);
        setChartText({ title: '', xLabel: '', yLabel: '' });
    });

    it('reads and writes chart text through workspace appearance', () => {
        const setChartTextOnChart = vi.fn();
        setChartInstance({ setChartText: setChartTextOnChart } as any);
        setChartText({ title: 'Existing title', xLabel: 'Existing X', yLabel: 'Existing Y' });

        initChartTextControls(workspace);

        const title = document.getElementById('chart-title-input') as HTMLInputElement;
        const xLabel = document.getElementById('x-axis-label-input') as HTMLInputElement;
        const yLabel = document.getElementById('y-axis-label-input') as HTMLInputElement;

        expect(title.value).toBe('Existing title');
        expect(xLabel.value).toBe('Existing X');
        expect(yLabel.value).toBe('Existing Y');

        title.value = 'Updated title';
        title.dispatchEvent(new Event('input'));

        expect(workspace.getSnapshot().appearance.chartText).toEqual({
            title: 'Updated title',
            xLabel: 'Existing X',
            yLabel: 'Existing Y',
        });
        expect(setChartTextOnChart).toHaveBeenLastCalledWith('Updated title', 'Existing X', 'Existing Y');
    });

    it('uses the same default axis labels while editing and after a workspace update', () => {
        workspace.setSelection(['HUFL', 'HULL']);
        const render = vi.fn();
        setChartInstance({ setChartText: render } as any);
        const dispose = initChartTextControls(workspace);
        const title = document.getElementById('chart-title-input') as HTMLInputElement;
        title.value = 'Comparison';
        title.dispatchEvent(new Event('input'));
        const expected = ['Comparison', `Time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`, 'Series values'];
        expect(render).toHaveBeenLastCalledWith(...expected);
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        expect(render).toHaveBeenLastCalledWith(...expected);
        expect(workspace.getSnapshot().appearance.chartText).toEqual({ title: 'Comparison', xLabel: '', yLabel: '' });
        dispose();
    });

    it('labels normalized values without replacing saved source-unit labels', () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="timeseries-normalize-series" type="checkbox" checked>');
        setChartText({ title: '', xLabel: '', yLabel: 'Temperature (°C)' });
        const render = vi.fn();
        setChartInstance({ setChartText: render } as any);
        const dispose = initChartTextControls(workspace);
        expect(render).toHaveBeenLastCalledWith('', expect.any(String), 'Normalized value (0–1)');
        expect(workspace.getSnapshot().appearance.chartText.yLabel).toBe('Temperature (°C)');
        (document.getElementById('timeseries-normalize-series') as HTMLInputElement).checked = false;
        workspace.setViewport({ xMin: 0, xMax: 1000, yMin: null, yMax: null });
        expect(render).toHaveBeenLastCalledWith('', expect.any(String), 'Temperature (°C)');
        dispose();
    });
});
