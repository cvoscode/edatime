import { describe, expect, it, vi } from 'vitest';

import { showPage } from './showPage.js';

describe('showPage', () => {
    it('dispatches navigation through the matching sidebar control', () => {
        document.body.innerHTML = '<nav class="sidebar"><button data-page="scatter" class="nav-item"></button></nav>';
        const button = document.querySelector<HTMLButtonElement>('[data-page="scatter"]')!;
        const click = vi.spyOn(button, 'click');

        showPage('scatter');

        expect(click).toHaveBeenCalledTimes(1);
    });
});
