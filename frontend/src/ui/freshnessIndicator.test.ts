import { afterEach, describe, expect, it, vi } from 'vitest';
import { initDataFreshnessIndicator, markDataUpdated, markDatasetChanged } from './freshnessIndicator.js';

describe('data freshness indicator', () => {
    afterEach(() => vi.useRealTimers());

    it('appears after an analysis update and keeps a relative timestamp', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        document.body.innerHTML = `
            <div id="data-freshness-indicator" hidden>
                <span class="data-freshness-time">—</span>
            </div>
            <div id="dataset-change-indicator" hidden><span class="dataset-freshness-time"></span></div>`;
        const dispose = initDataFreshnessIndicator();

        markDataUpdated();
        expect(document.getElementById('data-freshness-indicator')?.hidden).toBe(false);
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Analysis updated just now');

        vi.advanceTimersByTime(3 * 60_000);
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Analysis updated 3 min ago');
        dispose();
    });

    it('keeps dataset changes separate from analysis updates', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        document.body.innerHTML = `
            <div id="data-freshness-indicator" hidden><span class="data-freshness-time"></span></div>
            <div id="dataset-change-indicator" hidden><span class="dataset-freshness-time"></span></div>`;
        const dispose = initDataFreshnessIndicator();
        markDatasetChanged('ETTm2.csv', 'loaded');
        expect(document.querySelector('.dataset-freshness-time')?.textContent).toBe('Dataset loaded: ETTm2.csv, just now');
        expect(document.getElementById('data-freshness-indicator')?.hidden).toBe(true);
        markDataUpdated();
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Analysis updated just now');
        expect(document.querySelector('.dataset-freshness-time')?.textContent).toBe('Dataset loaded: ETTm2.csv, just now');
        vi.advanceTimersByTime(2 * 60_000);
        markDatasetChanged('ETTm2 prepared', 'changed');
        expect(document.querySelector('.dataset-freshness-time')?.textContent).toBe('Dataset changed: ETTm2 prepared, just now');
        expect(document.querySelector('.data-freshness-time')?.textContent).toBe('Analysis updated 2 min ago');
        dispose();
    });
});
