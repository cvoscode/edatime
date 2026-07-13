import { describe, expect, it, vi } from 'vitest';

import { wireHomeNavigationCards } from './navigation.js';

describe('wireHomeNavigationCards', () => {
    it('releases Home card click listeners when disposed', () => {
        document.body.innerHTML = '<button data-home-nav="upload" type="button">Upload</button>';
        const showPage = vi.fn();
        const dispose = wireHomeNavigationCards(showPage);
        dispose();

        (document.querySelector('[data-home-nav]') as HTMLButtonElement).click();

        expect(showPage).not.toHaveBeenCalled();
    });
});
