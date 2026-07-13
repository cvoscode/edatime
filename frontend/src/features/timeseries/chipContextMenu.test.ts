import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindChipContextMenu } from './chipContextMenu.js';
import { OPEN_COLUMN_FILTER_EVENT } from './filterModalEvents.js';

function createChipRail(column: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = `<div id="column-filter-modal" data-bound="1"></div><label class="series-chip"><input type="checkbox" value="${column}"></label>`;
    document.body.appendChild(container);
    return container;
}

function rightClick(container: HTMLElement): void {
    const chip = container.querySelector('.series-chip')!;
    chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('bindChipContextMenu', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('opens the selected column after a double right-click', () => {
        const open = vi.fn();
        document.addEventListener(OPEN_COLUMN_FILTER_EVENT, ((event: Event) => {
            open((event as CustomEvent<{ column: string | null }>).detail.column);
        }) as EventListener, { once: true });
        const container = createChipRail('HUFL');
        bindChipContextMenu(container);

        rightClick(container);
        rightClick(container);

        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('HUFL');
    });

    it('keeps double-click tracking local to each chip rail', () => {
        const open = vi.fn();
        document.addEventListener(OPEN_COLUMN_FILTER_EVENT, ((event: Event) => {
            open((event as CustomEvent<{ column: string | null }>).detail.column);
        }) as EventListener);
        const first = createChipRail('HUFL');
        const second = createChipRail('HUFL');
        bindChipContextMenu(first);
        bindChipContextMenu(second);

        rightClick(first);
        rightClick(second);

        expect(open).not.toHaveBeenCalled();
    });
});
