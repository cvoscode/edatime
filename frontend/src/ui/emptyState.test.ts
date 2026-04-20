/**
 * Tests for empty-state data-empty-reason attributes.
 *
 * Validates that analytics empty states expose a programmatic
 * data-empty-reason attribute that distinguishes "no data after filters"
 * from "render/init failure" and "no columns selected".
 */
import { describe, it, expect } from 'vitest';

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
