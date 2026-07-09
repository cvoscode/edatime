import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setChartInstance } from '../store/index.js';
import { initYRangeControls } from './yRangeControls.js';

describe('initYRangeControls — production no-op behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        setChartInstance(null);
    });

    it('is a complete no-op when the y-range toolbar DOM is absent', () => {
        // Production reality after improvement_features.md #15:
        // the entire Y range segment was removed from the toolbar,
        // so initYRangeControls() runs on every page load but must
        // touch nothing on the page and never call the chart API.
        const setStackFromZero = vi.fn();
        const setRobustDisplayRange = vi.fn();
        const resize = vi.fn();
        setChartInstance({ setStackFromZero, setRobustDisplayRange, resize } as any);

        expect(() => initYRangeControls()).not.toThrow();
        expect(setStackFromZero).not.toHaveBeenCalled();
        expect(setRobustDisplayRange).not.toHaveBeenCalled();
        expect(resize).not.toHaveBeenCalled();
    });

    it('does not throw or query the DOM twice when called repeatedly', () => {
        const resize = vi.fn();
        setChartInstance({ resize } as any);

        expect(() => {
            initYRangeControls();
            initYRangeControls();
            initYRangeControls();
        }).not.toThrow();
        expect(resize).not.toHaveBeenCalled();
    });

    it('still returns early when only the main toggle is present (partial DOM)', () => {
        // Defensive: if someone re-adds a single y-range field
        // without the rest, initYRangeControls must still bail
        // safely rather than partially wire controls.
        document.body.innerHTML = `
            <input id="y-stack-from-zero" type="checkbox" />
        `;

        const resize = vi.fn();
        setChartInstance({ resize } as any);

        expect(() => initYRangeControls()).not.toThrow();
        expect(resize).not.toHaveBeenCalled();
    });
});
