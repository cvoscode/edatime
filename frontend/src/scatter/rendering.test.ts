import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appState } from '../store/appStateCompat.js';
import { updateMarginalPlots } from './rendering.js';

class MockCanvasContext2D {
    ops: string[] = [];
    fillStyle = '';
    strokeStyle = '';
    lineWidth = 1;
    font = '';
    textAlign: CanvasTextAlign = 'start';
    textBaseline: CanvasTextBaseline = 'alphabetic';
    globalAlpha = 1;

    setTransform() { this.ops.push('setTransform'); }
    clearRect() { this.ops.push('clearRect'); }
    fillRect(_x: number, _y: number, w: number, h: number) { this.ops.push(`fillRect:${Math.round(w)}x${Math.round(h)}`); }
    strokeRect(_x: number, _y: number, w: number, h: number) { this.ops.push(`strokeRect:${Math.round(w)}x${Math.round(h)}`); }
    fillText(text: string) { this.ops.push(`fillText:${text}`); }
    beginPath() { this.ops.push('beginPath'); }
    moveTo() { this.ops.push('moveTo'); }
    lineTo() { this.ops.push('lineTo'); }
    arc() { this.ops.push('arc'); }
    closePath() { this.ops.push('closePath'); }
    stroke() { this.ops.push('stroke'); }
    fill() { this.ops.push('fill'); }
}

const contextByCanvas = new WeakMap<HTMLCanvasElement, MockCanvasContext2D>();

function bindRect(element: HTMLElement, width: number, height: number) {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            width,
            height,
            toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
        }),
    });
}

function signature(canvasId: string): string {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    return (contextByCanvas.get(canvas)?.ops || []).join('|');
}

describe('scatter marginal rendering modes', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        });

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: function getContext() {
                let ctx = contextByCanvas.get(this);
                if (!ctx) {
                    ctx = new MockCanvasContext2D();
                    contextByCanvas.set(this, ctx);
                }
                ctx.ops = [];
                return ctx;
            },
        });

        document.body.innerHTML = `
            <select id="scatter-x-col"><option value="HUFL" selected>HUFL</option></select>
            <select id="scatter-y-col"><option value="HULL" selected>HULL</option></select>
            <input id="scatter-bin-size" value="10">
            <select id="scatter-colormap"><option value="viridis" selected>Viridis</option></select>
            <select id="scatter-normalization"><option value="linear" selected>Linear</option></select>
            <select id="scatter-render-mode">
                <option value="scatter" selected>Scatter</option>
                <option value="density">Density</option>
            </select>
            <select id="scatter-diagonal-mode">
                <option value="histogram" selected>Histogram</option>
                <option value="kde">KDE</option>
                <option value="boxplot">Box Plot</option>
            </select>
            <select id="scatter-color-column"><option value="" selected>None</option></select>
            <select id="scatter-color-scale"><option value="viridis" selected>Viridis</option></select>
            <input id="scatter-matrix-mode" value="scatter">
            <input id="scatter-matrix-cell-size" value="160">
            <div id="scatter-chart"></div>
            <canvas id="scatter-marginal-x"></canvas>
            <div id="scatter-right-panel"><canvas id="scatter-marginal-y"></canvas><div id="scatter-colorbar-wrap" hidden></div></div>
        `;

        bindRect(document.getElementById('scatter-chart') as HTMLElement, 1308, 648);
        bindRect(document.getElementById('scatter-marginal-x') as HTMLElement, 1308, 64);
        bindRect(document.getElementById('scatter-marginal-y') as HTMLElement, 72, 712);

        appState.scatter.activeView = 'plot';
        appState.scatter.points = [
            [10, 2], [12, 4], [14, 8], [18, 16], [22, 12], [28, 9], [34, 5], [40, 3],
        ] as [number, number][];
        appState.scatter.view = { xMin: 8, xMax: 42, yMin: 0, yMax: 20 };
    });

    it('uses different drawing paths for histogram, kde, and boxplot marginals', () => {
        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;

        diagonalMode.value = 'histogram';
        updateMarginalPlots();
        const histogramSig = signature('scatter-marginal-x');

        diagonalMode.value = 'kde';
        updateMarginalPlots();
        const kdeSig = signature('scatter-marginal-x');

        diagonalMode.value = 'boxplot';
        updateMarginalPlots();
        const boxSig = signature('scatter-marginal-x');

        expect(histogramSig).not.toEqual(kdeSig);
        expect(histogramSig).not.toEqual(boxSig);
        expect(kdeSig).not.toEqual(boxSig);
    });

    it('shows marginals in density mode and keeps them on the right panel', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        renderMode.value = 'density';
        updateMarginalPlots();

        const marginalX = document.getElementById('scatter-marginal-x') as HTMLCanvasElement;
        const marginalY = document.getElementById('scatter-marginal-y') as HTMLCanvasElement;
        const rightPanel = document.getElementById('scatter-right-panel') as HTMLElement;

        // Marginals should now be visible in density mode.
        expect(marginalX.hidden).toBe(false);
        expect(marginalY.hidden).toBe(false);
        // Right panel hosts both the y-marginal and the colorbar in density mode.
        expect(rightPanel.hidden).toBe(false);
        expect(rightPanel.dataset.marginalActive).toBe('1');
        // #scatter-chart should reserve the 64px top strip via the .with-x-marginal class.
        expect(document.getElementById('scatter-chart')?.classList.contains('with-x-marginal')).toBe(true);
    });

    it('draws histogram, kde, and boxplot marginals in density mode', () => {
        const renderMode = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        const diagonalMode = document.getElementById('scatter-diagonal-mode') as HTMLSelectElement;
        renderMode.value = 'density';

        diagonalMode.value = 'histogram';
        updateMarginalPlots();
        const histX = signature('scatter-marginal-x');
        const histY = signature('scatter-marginal-y');

        diagonalMode.value = 'kde';
        updateMarginalPlots();
        const kdeX = signature('scatter-marginal-x');
        const kdeY = signature('scatter-marginal-y');

        diagonalMode.value = 'boxplot';
        updateMarginalPlots();
        const boxX = signature('scatter-marginal-x');
        const boxY = signature('scatter-marginal-y');

        // Each mode should produce a non-empty draw signature.
        expect(histX.length).toBeGreaterThan(0);
        expect(kdeX.length).toBeGreaterThan(0);
        expect(boxX.length).toBeGreaterThan(0);
        expect(histY.length).toBeGreaterThan(0);
        expect(kdeY.length).toBeGreaterThan(0);
        expect(boxY.length).toBeGreaterThan(0);

        // And the three modes should still differ on both axes.
        expect(histX).not.toEqual(kdeX);
        expect(histX).not.toEqual(boxX);
        expect(kdeX).not.toEqual(boxX);
        expect(histY).not.toEqual(kdeY);
        expect(histY).not.toEqual(boxY);
        expect(kdeY).not.toEqual(boxY);
    });
});
