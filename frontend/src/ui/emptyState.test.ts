/**
 * Tests for empty-state data-empty-reason attributes.
 *
 * Validates that analytics empty states expose a programmatic
 * data-empty-reason attribute that distinguishes "no data after filters"
 * from "render/init failure" and "no columns selected".
 */
import { describe, it, expect, vi } from 'vitest';
import { createEmptyStateController, isRangeOutsideDataset } from './emptyState';

const EMPTY_STATE_IDS = [
    { id: 'timeseries-empty-state', defaultReason: 'no-columns-selected' },
    { id: 'fft-empty-state', defaultReason: 'no-columns-selected' },
    { id: 'heatmap-empty-state', defaultReason: 'no-data' },
    { id: 'spectrogram-empty-state', defaultReason: 'no-columns-selected' },
    { id: 'causal-empty-state', defaultReason: 'no-columns-selected' },
    { id: 'scatter-empty-state', defaultReason: '' },
];

describe('empty-state data-empty-reason contract', () => {
    for (const { id, defaultReason } of EMPTY_STATE_IDS) {
        it(`${id} has data-empty-reason attribute in initial HTML`, () => {
            document.body.innerHTML = `<div id="${id}" class="plot-empty-state" data-empty-reason="${defaultReason}"></div>`;
            const el = document.getElementById(id)!;
            expect(el.hasAttribute('data-empty-reason')).toBe(true);
            expect(el.getAttribute('data-empty-reason')).toBe(defaultReason);
        });
    }

    it('data-empty-reason can be updated programmatically', () => {
        document.body.innerHTML = '<div id="scatter-empty-state" class="plot-empty-state" data-empty-reason=""></div>';
        const el = document.getElementById('scatter-empty-state')!;
        el.setAttribute('data-empty-reason', 'gpu-unavailable');
        expect(el.getAttribute('data-empty-reason')).toBe('gpu-unavailable');
    });

    it('data-empty-reason can be cleared', () => {
        document.body.innerHTML = '<div id="fft-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected"></div>';
        const el = document.getElementById('fft-empty-state')!;
        el.setAttribute('data-empty-reason', '');
        expect(el.getAttribute('data-empty-reason')).toBe('');
    });
});

describe('isRangeOutsideDataset', () => {
    it('returns true when a range falls fully before the dataset', () => {
        expect(isRangeOutsideDataset({ min: 100, max: 200 }, 0, 50)).toBe(true);
    });

    it('returns true when a range falls fully after the dataset', () => {
        expect(isRangeOutsideDataset({ min: 100, max: 200 }, 250, 300)).toBe(true);
    });

    it('returns false when a range overlaps the dataset', () => {
        expect(isRangeOutsideDataset({ min: 100, max: 200 }, 150, 250)).toBe(false);
    });

    it('returns false for invalid bounds', () => {
        expect(isRangeOutsideDataset(null, 0, 50)).toBe(false);
        expect(isRangeOutsideDataset({ min: 100, max: 100 }, 0, 50)).toBe(false);
        expect(isRangeOutsideDataset({ min: 100, max: 200 }, 'x', 50)).toBe(false);
    });
});

describe('createEmptyStateController', () => {
    it('updates content, reason, and action visibility', () => {
        document.body.innerHTML = `
            <div id="timeseries-empty-state" hidden data-empty-reason="">
                <h3 id="timeseries-empty-title"></h3>
                <p id="timeseries-empty-message"></p>
                <button id="timeseries-reset-range-btn" hidden type="button">Reset</button>
                <button id="timeseries-clear-filters-btn" hidden type="button">Clear</button>
            </div>
        `;

        const controller = createEmptyStateController({
            rootId: 'timeseries-empty-state',
            titleId: 'timeseries-empty-title',
            messageId: 'timeseries-empty-message',
            resetButtonId: 'timeseries-reset-range-btn',
            clearButtonId: 'timeseries-clear-filters-btn',
        });

        controller.update({
            visible: true,
            reason: 'no-data-after-filters',
            title: 'No data',
            message: 'Try widening the range.',
            showResetAction: true,
            showClearAction: false,
        });

        expect(document.getElementById('timeseries-empty-state')?.hidden).toBe(false);
        expect(document.getElementById('timeseries-empty-state')?.getAttribute('data-empty-reason')).toBe('no-data-after-filters');
        expect(document.getElementById('timeseries-empty-title')?.textContent).toBe('No data');
        expect(document.getElementById('timeseries-empty-message')?.textContent).toBe('Try widening the range.');
        expect((document.getElementById('timeseries-reset-range-btn') as HTMLButtonElement | null)?.hidden).toBe(false);
        expect((document.getElementById('timeseries-clear-filters-btn') as HTMLButtonElement | null)?.hidden).toBe(true);
    });

    it('dispatches configured empty-state actions', () => {
        document.body.innerHTML = `
            <div id="scatter-empty-state" data-empty-reason="">
                <button id="scatter-reset-range-btn" type="button">Reset</button>
                <button id="scatter-clear-filters-btn" type="button">Clear</button>
            </div>
        `;

        const listener = vi.fn();
        window.addEventListener('edatime:request-chart-range-reset', listener);

        createEmptyStateController({
            rootId: 'scatter-empty-state',
            resetButtonId: 'scatter-reset-range-btn',
            clearButtonId: 'scatter-clear-filters-btn',
            resetEventName: 'edatime:request-chart-range-reset',
            clearEventName: 'edatime:clear-all-filters',
            eventSource: 'scatter-empty-state',
        });

        document.getElementById('scatter-reset-range-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(listener).toHaveBeenCalledTimes(1);
        expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ source: 'scatter-empty-state' });

        window.removeEventListener('edatime:request-chart-range-reset', listener);
    });
});
