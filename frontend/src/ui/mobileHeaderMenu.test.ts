import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initMobileHeaderMenu } from './mobileHeaderMenu.js';

describe('mobile header overflow menu', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="workflow-toggle-btn"></button>
            <div id="mobile-header-menu">
              <button id="mobile-header-menu-btn" aria-expanded="false"></button>
              <div id="mobile-header-menu-popover" role="menu" hidden>
                <button role="menuitem" data-mobile-header-action="workflow-toggle-btn">Workflow</button>
                <button role="menuitem" data-mobile-header-action="missing">Missing</button>
              </div>
            </div>`;
    });

    it('forwards an overflow action to the canonical control and closes', () => {
        const action = vi.fn();
        document.getElementById('workflow-toggle-btn')?.addEventListener('click', action);
        const dispose = initMobileHeaderMenu();
        const toggle = document.getElementById('mobile-header-menu-btn') as HTMLButtonElement;
        const popover = document.getElementById('mobile-header-menu-popover') as HTMLElement;

        toggle.click();
        expect(popover.hidden).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        (popover.querySelector('[role="menuitem"]') as HTMLButtonElement).click();

        expect(action).toHaveBeenCalledTimes(1);
        expect(popover.hidden).toBe(true);
        dispose();
    });

    it('supports arrow navigation and Escape focus restoration', async () => {
        initMobileHeaderMenu();
        const toggle = document.getElementById('mobile-header-menu-btn') as HTMLButtonElement;
        const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        toggle.click();
        await Promise.resolve();
        expect(document.activeElement).toBe(items[0]);

        items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(items[1]);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(toggle);
    });
});
