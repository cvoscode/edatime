import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    __resetTimeseriesShortcutsForTest,
    initTimeseriesShortcuts,
} from './timeseriesShortcuts.js';

let cleanup: (() => void) | undefined;

function createDeps() {
    return {
        fetchAndRender: vi.fn().mockResolvedValue(undefined),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        chartExportPng: vi.fn(),
        exportFilteredCsv: vi.fn(),
        exportFilteredJson: vi.fn(),
        registerCleanup: vi.fn((callback: () => void) => { cleanup = callback; }),
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
    __resetTimeseriesShortcutsForTest();
    delete (window as any).__edatime;
});

describe('timeseries shortcuts', () => {
    it('binds once without publishing a window marker', async () => {
        renderPage('timeseries');
        const deps = createDeps();

        initTimeseriesShortcuts(deps);
        initTimeseriesShortcuts(deps);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true, bubbles: true }));
        await Promise.resolve();

        expect(deps.resetZoom).toHaveBeenCalledTimes(1);
        expect(deps.fetchAndRender).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime?.timeseriesShortcutsBound).toBeUndefined();
    });

    it('removes its listener on cleanup so a new runtime can rebind it', () => {
        renderPage('timeseries');
        const first = createDeps();
        initTimeseriesShortcuts(first);
        cleanup?.();

        const second = createDeps();
        initTimeseriesShortcuts(second);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', shiftKey: true, bubbles: true }));

        expect(first.chartExportPng).not.toHaveBeenCalled();
        expect(second.chartExportPng).toHaveBeenCalledTimes(1);
    });
});
