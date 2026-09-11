import { describe, expect, it, vi } from 'vitest';

import { showPage } from './showPage.js';

describe('showPage', () => {
    it('dispatches navigation through the matching sidebar control', () => {
        document.body.innerHTML = '<nav class="sidebar"><button data-page="correlations" class="nav-item"></button></nav>';
        const button = document.querySelector<HTMLButtonElement>('[data-page="correlations"]')!;
        const click = vi.spyOn(button, 'click');

        showPage('correlations');

        expect(click).toHaveBeenCalledTimes(1);
    });
});
