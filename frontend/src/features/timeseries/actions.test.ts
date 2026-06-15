/**
 * Tests for the timeseries export-button click wiring.
 *
 * Regression: the timeseries page's top-level PNG/CSV buttons and the
 * export-options modal's SVG/CSV/JSON/Parquet buttons used to be present
 * in the DOM but had no click handlers — clicking them did nothing. This
 * test pins the wiring done by `initTimeseriesExportButtons` so we
 * don't regress.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTimeseriesExportButtons } from './actions.js';

const BUTTON_IDS = [
    'export-png-btn',
    'export-csv-btn',
    'export-svg-btn',
    'export-data-csv-btn',
    'export-data-json-btn',
    'export-data-parquet-btn',
] as const;

function buildExportDom(): void {
    document.body.innerHTML = BUTTON_IDS.map((id) => (
        `<button id="${id}" type="button">${id}</button>`
    )).join('');
}

describe('initTimeseriesExportButtons', () => {
    beforeEach(() => {
        buildExportDom();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('wires every export button to its matching handler', () => {
        const deps = {
            chartExportPng: vi.fn(),
            chartExportSvg: vi.fn(),
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            exportFilteredParquet: vi.fn(),
        };

        initTimeseriesExportButtons(deps);

        document.getElementById('export-png-btn')!.click();
        document.getElementById('export-csv-btn')!.click();
        document.getElementById('export-svg-btn')!.click();
        document.getElementById('export-data-csv-btn')!.click();
        document.getElementById('export-data-json-btn')!.click();
        document.getElementById('export-data-parquet-btn')!.click();

        expect(deps.chartExportPng).toHaveBeenCalledTimes(1);
        expect(deps.exportFilteredCsv).toHaveBeenCalledTimes(2);
        expect(deps.chartExportSvg).toHaveBeenCalledTimes(1);
        expect(deps.exportFilteredJson).toHaveBeenCalledTimes(1);
        expect(deps.exportFilteredParquet).toHaveBeenCalledTimes(1);
    });

    it('does not double-bind when called multiple times', () => {
        const chartExportPng = vi.fn();
        initTimeseriesExportButtons({
            chartExportPng,
            chartExportSvg: vi.fn(),
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            exportFilteredParquet: vi.fn(),
        });
        // Second call should not throw and should not re-bind.
        initTimeseriesExportButtons({
            chartExportPng,
            chartExportSvg: vi.fn(),
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            exportFilteredParquet: vi.fn(),
        });

        document.getElementById('export-png-btn')!.click();
        expect(chartExportPng).toHaveBeenCalledTimes(1);
    });

    it('is tolerant of missing buttons', () => {
        document.body.innerHTML = '';

        expect(() => initTimeseriesExportButtons({
            chartExportPng: vi.fn(),
            chartExportSvg: vi.fn(),
            exportFilteredCsv: vi.fn(),
            exportFilteredJson: vi.fn(),
            exportFilteredParquet: vi.fn(),
        })).not.toThrow();
    });
});
