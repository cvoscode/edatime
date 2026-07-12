import { describe, expect, it } from 'vitest';

import { computeInteractiveScatterLimit } from './renderLimit.js';

describe('computeInteractiveScatterLimit', () => {
    it('derives a lower interactive limit from the current chart surface', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 600, height: 300 }),
        });

        expect(computeInteractiveScatterLimit(container, { devicePixelRatio: 1 })).toBe(45_000);
    });

    it('clamps the derived limit to the configured maximum', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 4_000, height: 2_000 }),
        });

        expect(computeInteractiveScatterLimit(container, { devicePixelRatio: 2 })).toBe(200_000);
    });

    it('falls back to a safe minimum when layout metrics are unavailable', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ width: 0, height: 0 }),
        });

        expect(computeInteractiveScatterLimit(container, { devicePixelRatio: 1 })).toBe(25_000);
    });
});
