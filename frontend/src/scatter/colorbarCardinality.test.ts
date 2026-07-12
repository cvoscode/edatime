/**
 * Audit issue 2.2: regression tests for the categorical color
 * cardinality badge rendered under the scatter colorbar.
 *
 * The backend collapses the long tail of a categorical color
 * column into a single "Other" bucket and reports the breakdown via
 * `scatterState.colorCardinality`. The rendering layer must
 * surface the bucketed count as a small hint under the colorbar
 * name so the user knows the legend is truncated.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scatterState } from '../store/index.js';
import { updateColorbarUI } from './rendering.js';

function setupDom() {
    document.body.innerHTML = `
        <div id="scatter-right-panel">
            <canvas id="scatter-marginal-y"></canvas>
            <div id="scatter-colorbar-wrap" hidden>
                <span id="scatter-colorbar-max">1.00</span>
                <canvas id="scatter-colorbar"></canvas>
                <span id="scatter-colorbar-min">0.00</span>
                <span id="scatter-colorbar-name">Color</span>
                <span id="scatter-colorbar-cardinality" hidden></span>
            </div>
        </div>
        <select id="scatter-render-mode">
            <option value="scatter" selected>Scatter</option>
            <option value="density">Density</option>
        </select>
        <select id="scatter-color-column">
            <option value="" selected>None</option>
            <option value="OT">OT</option>
        </select>
        <select id="scatter-color-scale">
            <option value="viridis" selected>Viridis</option>
        </select>
    `;
}

describe('scatter colorbar cardinality badge', () => {
    beforeEach(() => {
        setupDom();
        // Force the colorbar visible by giving the rendering path a
        // continuous color range; otherwise `updateColorbarUI`
        // short-circuits before it touches the cardinality element.
        scatterState.activeView = 'plot';
        scatterState.colorValues = [1.0, 2.0, 3.0];
        scatterState.colorMin = 1.0;
        scatterState.colorMax = 3.0;
        scatterState.colorColumn = 'OT';
        scatterState.colorCardinality = null;
        (document.getElementById('scatter-color-column') as HTMLSelectElement).value = 'OT';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('hides the badge when no cardinality is reported', () => {
        const cardEl = document.getElementById('scatter-colorbar-cardinality') as HTMLElement;
        updateColorbarUI();
        expect(cardEl.hidden).toBe(true);
        expect(cardEl.textContent).toBe('');
    });

    it('hides the badge when bucketed is 0 (no long tail)', () => {
        const cardEl = document.getElementById('scatter-colorbar-cardinality') as HTMLElement;
        scatterState.colorCardinality = { requested: 5, used: 5, bucketed: 0 };
        updateColorbarUI();
        expect(cardEl.hidden).toBe(true);
    });

    it('shows the badge with used/bucketed counts when long tail is bucketed', () => {
        const cardEl = document.getElementById('scatter-colorbar-cardinality') as HTMLElement;
        scatterState.colorCardinality = { requested: 80, used: 50, bucketed: 30 };
        updateColorbarUI();
        expect(cardEl.hidden).toBe(false);
        expect(cardEl.textContent).toBe('50 shown · 30 other');
    });

    it('hides the badge again after a new request reports bucketed = 0', () => {
        const cardEl = document.getElementById('scatter-colorbar-cardinality') as HTMLElement;
        scatterState.colorCardinality = { requested: 80, used: 50, bucketed: 30 };
        updateColorbarUI();
        expect(cardEl.hidden).toBe(false);

        // Subsequent request: low-cardinality column, no bucketing.
        scatterState.colorCardinality = { requested: 3, used: 3, bucketed: 0 };
        updateColorbarUI();
        expect(cardEl.hidden).toBe(true);
    });
});
