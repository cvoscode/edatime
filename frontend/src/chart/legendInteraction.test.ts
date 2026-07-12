import { describe, expect, it, vi } from 'vitest';
import { buildLegendEntries, clampLegendPosition, isShiftOnlyGesture, LegendWindowListenerScope } from './legendInteraction.js';

describe('legend interaction policy', () => {
    it('clamps legend placement inside the chart margins', () => {
        expect(clampLegendPosition({ left: 290, top: 170 }, { clientWidth: 300, clientHeight: 180 }, { offsetWidth: 120, offsetHeight: 60 })).toEqual({ left: 172, top: 112 });
        expect(clampLegendPosition({ left: -20, top: -10 }, { clientWidth: 300, clientHeight: 180 }, { offsetWidth: 120, offsetHeight: 60 })).toEqual({ left: 8, top: 8 });
    });

    it('allows only an unmodified Shift gesture to move the legend', () => {
        expect(isShiftOnlyGesture({ shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
        expect(isShiftOnlyGesture({ shiftKey: true, ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
    });

    it('groups colorized segments into one toggleable trace entry', () => {
        expect(buildLegendEntries([
            { type: 'line', name: 'temperature', color: '#f00', visible: false },
            { type: 'line', name: 'temperature__segment', visible: true },
            { type: 'line', name: 'temperature__markers', visible: true },
        ], ['#000'], (name) => name.replace(/__.*$/, ''))).toEqual([{ name: 'temperature', color: '#f00', visible: true }]);
    });

    it('removes every tracked window listener on disposal', () => {
        const scope = new LegendWindowListenerScope();
        const listener = vi.fn();
        scope.add('legend-test', listener);
        window.dispatchEvent(new Event('legend-test'));
        scope.dispose();
        window.dispatchEvent(new Event('legend-test'));
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
