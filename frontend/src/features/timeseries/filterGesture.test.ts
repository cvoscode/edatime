import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    hasFilterModalOpener: vi.fn(() => true),
    openFilterForColumn: vi.fn(),
}));

vi.mock('./filterModalService.js', () => mocks);

import { initChartPageFilterGesture } from './filterGesture.js';

function dispatchContextMenu(target: HTMLElement): MouseEvent {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
}

describe('Timeseries filter gesture', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.hasFilterModalOpener.mockReturnValue(true);
        document.body.innerHTML = '<section id="page-timeseries"><div id="main-chart"></div><button id="outside-plot"></button></section>';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('opens the column-filter modal after a double context-menu outside the plot', () => {
        vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200);
        initChartPageFilterGesture();

        const target = document.getElementById('outside-plot') as HTMLButtonElement;
        expect(dispatchContextMenu(target).defaultPrevented).toBe(true);
        expect(mocks.openFilterForColumn).not.toHaveBeenCalled();

        expect(dispatchContextMenu(target).defaultPrevented).toBe(true);
        expect(mocks.openFilterForColumn).toHaveBeenCalledWith(null);
    });

    it('leaves plot context menus untouched', () => {
        initChartPageFilterGesture();

        const plot = document.getElementById('main-chart') as HTMLDivElement;
        expect(dispatchContextMenu(plot).defaultPrevented).toBe(false);
        expect(mocks.openFilterForColumn).not.toHaveBeenCalled();
    });

    it('does not bind the page more than once', () => {
        initChartPageFilterGesture();
        initChartPageFilterGesture();
        vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200);

        const target = document.getElementById('outside-plot') as HTMLButtonElement;
        dispatchContextMenu(target);
        dispatchContextMenu(target);

        expect(mocks.openFilterForColumn).toHaveBeenCalledTimes(1);
    });
});
