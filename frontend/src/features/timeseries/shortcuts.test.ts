import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTimeseriesShortcuts } from './shortcuts.js';

let cleanup: (() => void) | undefined;

function createDeps() {
    return {
        fetchAndRender: vi.fn().mockResolvedValue(undefined),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        chartExportPng: vi.fn(),
        exportFilteredCsv: vi.fn(),
        exportFilteredJson: vi.fn(),
    };
}

function renderPage(page = 'timeseries'): void {
    document.body.innerHTML = `
        <div class="page" data-page-name="timeseries" ${page === 'timeseries' ? '' : 'hidden'}></div>
        <div class="page" data-page-name="scatter" ${page === 'scatter' ? '' : 'hidden'}></div>
        <button id="adaptive-clear-btn" type="button"></button>
        <button id="scatter-export-csv-btn" type="button"></button>
    `;
}

afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
    delete (window as any).__edatime;
});

describe('Timeseries shortcuts', () => {
    it('binds once without publishing a window marker', async () => {
        renderPage('timeseries');
        const deps = createDeps();
        const shortcuts = createTimeseriesShortcuts();

        cleanup = shortcuts.mount(deps);
        shortcuts.mount(deps);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true }));
        await Promise.resolve();

        expect(deps.resetZoom).toHaveBeenCalledTimes(1);
        expect(deps.fetchAndRender).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime?.timeseriesShortcutsBound).toBeUndefined();
    });

    it('removes its listener on cleanup so a new runtime can rebind it', () => {
        renderPage('timeseries');
        const first = createDeps();
        cleanup = createTimeseriesShortcuts().mount(first);
        cleanup?.();

        const second = createDeps();
        cleanup = createTimeseriesShortcuts().mount(second);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true }));

        expect(first.chartExportPng).not.toHaveBeenCalled();
        expect(second.chartExportPng).toHaveBeenCalledTimes(1);
    });

    it('does not let one feature instance suppress another controller binding', () => {
        renderPage('timeseries');
        const first = createDeps();
        const second = createDeps();
        const firstCleanup = createTimeseriesShortcuts().mount(first);
        cleanup = createTimeseriesShortcuts().mount(second);

        firstCleanup();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true }));

        expect(first.chartExportPng).not.toHaveBeenCalled();
        expect(second.chartExportPng).toHaveBeenCalledTimes(1);
    });
});
