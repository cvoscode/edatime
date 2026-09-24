import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../workspace/workspaceStore.js';
import { initDrawControls } from './drawControls.js';
import { primaryChart } from '../charts/primaryChart.js';
import { getDropdownController, upgradeSelects } from './primitives/Dropdown.js';
import type { ChartInstance } from '../types/chart.js';

describe('draw controls', () => {
    let dispose: (() => void) | undefined;
    beforeEach(() => {
        document.body.innerHTML = '<button id="adaptive-clear-btn" type="button"></button>';
    });

    afterEach(() => {
        dispose?.();
        getDropdownController('draw-tool')?.destroy();
        primaryChart.replace(null);
    });

    it('clears adaptive filters from workspace intent', () => {
        const workspace = createWorkspaceStore();
        const filter = { id: 'line-1', column: 'value', x1: 0, y1: 0, x2: 1, y2: 1, keepAbove: true };
        workspace.setFilters({ columnRanges: {}, adaptiveLines: [filter] });

        dispose = initDrawControls(vi.fn(), workspace);
        (document.getElementById('adaptive-clear-btn') as HTMLButtonElement).click();

        expect(workspace.getSnapshot().filters.adaptiveLines).toEqual([]);
    });

    it('keeps upgraded drawing controls consistent with renderer capabilities and restores them on return', () => {
        document.body.innerHTML = `
            <select id="draw-tool"><option value="none">Inspect</option><option value="arrow">Arrow</option></select>
            <input id="draw-color" type="color" value="#123456">
            <input id="draw-width" type="number" value="4">
            <button id="draw-clear-btn">Clear</button>
            <p id="timeseries-drawing-unavailable" hidden>Drawing unavailable</p>`;
        upgradeSelects();
        const renderer = { capabilities: { drawing: false }, setDrawMode: vi.fn(), clearDrawings: vi.fn() };
        primaryChart.replace(renderer as unknown as ChartInstance);
        dispose = initDrawControls(vi.fn(), createWorkspaceStore());
        const dropdown = getDropdownController('draw-tool')!;
        expect(dropdown.trigger.disabled).toBe(true);
        expect(document.getElementById('draw-width')?.hasAttribute('disabled')).toBe(true);
        expect(document.getElementById('timeseries-drawing-unavailable')?.hidden).toBe(false);

        const drawingRenderer = { ...renderer, capabilities: { drawing: true } };
        primaryChart.replace(drawingRenderer as unknown as ChartInstance);
        expect(dropdown.trigger.disabled).toBe(false);
        expect(document.getElementById('draw-width')?.hasAttribute('disabled')).toBe(false);
        expect(document.getElementById('timeseries-drawing-unavailable')?.hidden).toBe(true);
        expect(dropdown.root.title).toBe('');
        dropdown.setValue('arrow', { emitChange: true });
        expect(renderer.setDrawMode).toHaveBeenCalledWith('arrow', '#123456', 4);
        document.getElementById('draw-clear-btn')?.click();
        expect(renderer.clearDrawings).toHaveBeenCalledTimes(1);
    });
});
