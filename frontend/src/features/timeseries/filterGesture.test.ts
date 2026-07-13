import { afterEach, describe, expect, it, vi } from 'vitest';
import { initChartPageFilterGesture } from './filterGesture.js';

describe('initChartPageFilterGesture', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('opens the column filter after a double right-click outside the chart', () => {
        document.body.innerHTML = '<section id="page-timeseries"><div id="toolbar"></div></section>';
        const openColumnFilter = vi.fn();
        initChartPageFilterGesture(openColumnFilter);
        const target = document.getElementById('toolbar')!;

        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

        expect(openColumnFilter).toHaveBeenCalledWith(null);
    });

    it('releases its shortcut listener on disposal', () => {
        document.body.innerHTML = '<section id="page-timeseries"><div id="toolbar"></div></section>';
        const openColumnFilter = vi.fn();
        const dispose = initChartPageFilterGesture(openColumnFilter);
        dispose();
        const target = document.getElementById('toolbar')!;

        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

        expect(openColumnFilter).not.toHaveBeenCalled();
    });
});
