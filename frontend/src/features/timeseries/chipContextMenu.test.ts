import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindChipContextMenu } from './chipContextMenu.js';
import { __resetFilterModalOpenerForTests, registerFilterModalOpener } from './filterModalService.js';

function createChipRail(column: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = `<label class="series-chip"><input type="checkbox" value="${column}"></label>`;
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
        __resetFilterModalOpenerForTests();
    });

    it('opens the selected column after a double right-click', () => {
        const open = vi.fn();
        registerFilterModalOpener(open);
        const container = createChipRail('HUFL');
        bindChipContextMenu(container);

        rightClick(container);
        rightClick(container);

        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith('HUFL');
    });

    it('keeps double-click tracking local to each chip rail', () => {
        const open = vi.fn();
        registerFilterModalOpener(open);
        const first = createChipRail('HUFL');
        const second = createChipRail('HUFL');
        bindChipContextMenu(first);
        bindChipContextMenu(second);

        rightClick(first);
        rightClick(second);

        expect(open).not.toHaveBeenCalled();
    });
});
