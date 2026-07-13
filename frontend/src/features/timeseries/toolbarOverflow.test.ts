import { afterEach, describe, expect, it } from 'vitest';

import { createToolbarOverflow } from '../../ui/toolbarOverflow.js';

function createShelf(wrapped: boolean, fieldsClass = 'scatter-toolbar__fields'): { shelf: HTMLElement; fields: HTMLElement; menu: HTMLElement } {
    const shelf = document.createElement('div');
    const segment = document.createElement('div');
    segment.className = 'scatter-toolbar__segment';
    const fields = document.createElement('div');
    fields.className = fieldsClass;
    for (const [index, label] of ['A', 'B'].entries()) {
        const field = document.createElement('label');
        field.className = 'scatter-toolbar__field';
        field.textContent = label;
        Object.defineProperty(field, 'offsetTop', { configurable: true, value: wrapped && index === 1 ? 40 : 0 });
        fields.appendChild(field);
    }
    const overflow = document.createElement('details');
    overflow.className = 'scatter-toolbar__overflow';
    overflow.innerHTML = '<summary class="scatter-toolbar__overflow-btn"></summary><div class="scatter-toolbar__overflow-menu"></div>';
    fields.appendChild(overflow);
    segment.appendChild(fields);
    shelf.appendChild(segment);
    document.body.appendChild(shelf);
    return { shelf, fields, menu: overflow.querySelector('.scatter-toolbar__overflow-menu')! as HTMLElement };
}

describe('timeseries toolbar overflow configuration', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('moves wrapped fields and restores them when disposed', () => {
        const { shelf, fields, menu } = createShelf(true);
        const controller = createToolbarOverflow(shelf, { showCount: true })!;

        controller.rebalanceNow();
        expect(menu.children).toHaveLength(1);
        expect(fields.querySelectorAll(':scope > .scatter-toolbar__field')).toHaveLength(1);

        controller.dispose();
        expect(menu.children).toHaveLength(0);
        expect(fields.querySelectorAll(':scope > .scatter-toolbar__field')).toHaveLength(2);
    });

    it('keeps separate shelves isolated', () => {
        const first = createShelf(true);
        const second = createShelf(false);
        const firstController = createToolbarOverflow(first.shelf, { showCount: true })!;
        const secondController = createToolbarOverflow(second.shelf, { showCount: true })!;

        firstController.rebalanceNow();
        secondController.rebalanceNow();

        expect(first.menu.children).toHaveLength(1);
        expect(second.menu.children).toHaveLength(0);
    });

    it('supports the Timeseries controls container and clears its badge after unwrapping', () => {
        const { shelf, fields, menu } = createShelf(true, 'scatter-toolbar__controls');
        const controller = createToolbarOverflow(shelf, {
            fieldsSelector: ':scope > .scatter-toolbar__fields, :scope > .scatter-toolbar__controls',
            showCount: true,
        })!;

        controller.rebalanceNow();
        const badge = shelf.querySelector<HTMLElement>('.scatter-toolbar__overflow-count');
        expect(menu.children).toHaveLength(1);
        expect(badge?.textContent).toBe('1');
        expect(badge?.hidden).toBe(false);

        Object.defineProperty(menu.children[0]!, 'offsetTop', {
            configurable: true,
            value: 0,
        });
        controller.rebalanceNow();

        expect(menu.children).toHaveLength(0);
        expect(badge?.hidden).toBe(true);
        controller.dispose();
    });
});
