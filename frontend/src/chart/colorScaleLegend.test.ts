import { afterEach, describe, expect, it } from 'vitest';
import { renderColorScaleLegend } from './colorScaleLegend.js';

function mountLegend(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = `
        <div id="timeseries-colorbar-wrap"><span id="timeseries-colorbar-name"></span><span id="timeseries-colorbar-min"></span><span id="timeseries-colorbar-max"></span><span id="timeseries-colorbar"></span></div>
        <div id="timeseries-categorical-wrap"><span id="timeseries-categorical-name"></span><div id="timeseries-categorical-legend"></div></div>`;
    document.body.appendChild(root);
    return root;
}

afterEach(() => document.body.replaceChildren());

describe('renderColorScaleLegend', () => {
    it('shows the numeric scale and hides the categorical legend', () => {
        mountLegend();
        renderColorScaleLegend('temperature', { isNumeric: true, min: 1.25, max: 3.5, categories: [] });

        expect(document.getElementById('timeseries-colorbar-wrap')?.hidden).toBe(false);
        expect(document.getElementById('timeseries-colorbar-name')?.textContent).toBe('temperature');
        expect(document.getElementById('timeseries-colorbar-min')?.textContent).toBe('1.25');
        expect(document.getElementById('timeseries-categorical-wrap')?.hidden).toBe(true);
    });

    it('uses text nodes for categorical labels and clears stale controls when disabled', () => {
        mountLegend();
        renderColorScaleLegend('status', { isNumeric: false, min: null, max: null, categories: ['<ok>', 'warn'] });

        const legend = document.getElementById('timeseries-categorical-legend')!;
        expect(legend.textContent).toBe('<ok>warn');
        expect(legend.querySelectorAll('.scatter-distribution-legend-item')).toHaveLength(2);
        renderColorScaleLegend(null, null);
        expect(document.getElementById('timeseries-categorical-wrap')?.hidden).toBe(true);
    });
});
