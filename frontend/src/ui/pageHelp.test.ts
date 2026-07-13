import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the shared `initPageHelp` helper.
 *
 * The helper has no runtime dependencies and renders straight into the
 * DOM, so we keep these as plain happy-dom tests without any module
 * mocking. The only DOM-level fake we use is `focus` (jsdom-style), and
 * happy-dom supports it natively on HTMLElement.
 */

describe('initPageHelp', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('binds the trigger button and is idempotent on repeated calls', async () => {
        document.body.innerHTML = `
            <button id="test-help-btn" type="button">?</button>
        `;
        const { initPageHelp } = await import('./pageHelp.js');

        const content = {
            pageName: 'Test',
            intro: 'A short intro.',
            sections: [{ title: 'Overview', body: 'Body text.' }],
        };

        initPageHelp('test', content);
        const trigger = document.getElementById('test-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Test page');

        // Capture the original listener by counting clicks that open the
        // modal: the second init call must not register a second handler.
        const before = countOpenListeners();
        initPageHelp('test', content);
        const after = countOpenListeners();
        expect(after).toBe(before);
    });

    it('opens the modal with the expected content on click', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');

        initPageHelp('test', {
            pageName: 'Test',
            intro: 'A short intro.',
            sections: [
                { title: 'Overview', body: 'Body text.' },
                { title: 'Steps', bullets: ['One', 'Two', 'Three'] },
            ],
            shortcuts: [{ keys: 'Ctrl+K', description: 'Command palette' }],
            tips: ['A small tip.'],
        });

        const trigger = document.getElementById('test-help-btn') as HTMLButtonElement;
        trigger.click();

        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.getAttribute('role')).toBe('dialog');
        expect(modal?.getAttribute('aria-modal')).toBe('true');
        expect(modal?.textContent).toContain('Test — Help');
        expect(modal?.textContent).toContain('A short intro.');
        expect(modal?.textContent).toContain('Overview');
        expect(modal?.textContent).toContain('Body text.');
        expect(modal?.textContent).toContain('Steps');
        expect(modal?.textContent).toContain('One');
        expect(modal?.textContent).toContain('Two');
        expect(modal?.textContent).toContain('Three');
        expect(modal?.textContent).toContain('Ctrl+K');
        expect(modal?.textContent).toContain('Command palette');
        expect(modal?.textContent).toContain('Helpful tips');
        expect(modal?.textContent).toContain('A small tip.');
    });

    it('closes when the close button is clicked', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });

        const trigger = document.getElementById('test-help-btn') as HTMLButtonElement;
        trigger.click();
        expect(document.getElementById('page-help-modal')).not.toBeNull();

        const closeBtn = document.getElementById('page-help-close') as HTMLButtonElement;
        closeBtn.click();
        expect(document.getElementById('page-help-modal')).toBeNull();
    });

    it('closes on Escape', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });

        (document.getElementById('test-help-btn') as HTMLButtonElement).click();
        expect(document.getElementById('page-help-modal')).not.toBeNull();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.getElementById('page-help-modal')).toBeNull();
    });

    it('closes when the backdrop is clicked but not when the dialog body is clicked', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });

        (document.getElementById('test-help-btn') as HTMLButtonElement).click();
        const modal = document.getElementById('page-help-modal') as HTMLElement;
        expect(modal).not.toBeNull();

        // Clicking inside the dialog content should NOT close it.
        const dialog = modal.querySelector('.modal') as HTMLElement;
        dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('page-help-modal')).not.toBeNull();

        // Clicking the backdrop itself closes it.
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(document.getElementById('page-help-modal')).toBeNull();
    });

    it('removes a previous instance when the trigger is clicked twice', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });

        const trigger = document.getElementById('test-help-btn') as HTMLButtonElement;
        trigger.click();
        trigger.click();
        // Only one modal at a time.
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });

    it('escapes HTML in user-provided copy to prevent injection', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', {
            pageName: '<img src=x onerror=alert(1)>',
            intro: 'Intro with <script>bad()</script>.',
            sections: [{ title: 'Sec & "quoted"', body: 'Body < > & "\'' }],
        });

        (document.getElementById('test-help-btn') as HTMLButtonElement).click();
        const modal = document.getElementById('page-help-modal') as HTMLElement;
        expect(modal.querySelector('img')).toBeNull();
        expect(modal.querySelector('script')).toBeNull();
        expect(modal.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(modal.textContent).toContain('Intro with <script>bad()</script>.');
        expect(modal.textContent).toContain('Sec & "quoted"');
    });

    it('does nothing when the trigger button is missing', async () => {
        document.body.innerHTML = '<div></div>';
        const { initPageHelp } = await import('./pageHelp.js');
        // No throw, no DOM side effects.
        initPageHelp('absent', { pageName: 'X', intro: 'I.', sections: [] });
        expect(document.getElementById('page-help-modal')).toBeNull();
    });

    it('releases the trigger and open modal when disposed', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        const dispose = initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });
        (document.getElementById('test-help-btn') as HTMLButtonElement).click();
        expect(document.getElementById('page-help-modal')).not.toBeNull();

        dispose();
        (document.getElementById('test-help-btn') as HTMLButtonElement).click();
        expect(document.getElementById('page-help-modal')).toBeNull();
    });

    it('restores focus to the trigger on close', async () => {
        document.body.innerHTML = `<button id="test-help-btn" type="button">?</button>`;
        const { initPageHelp } = await import('./pageHelp.js');
        initPageHelp('test', { pageName: 'Test', intro: 'Intro.', sections: [] });

        const trigger = document.getElementById('test-help-btn') as HTMLButtonElement;
        const focusSpy = vi.spyOn(trigger, 'focus');
        trigger.click();
        // focus is moved to the close button via queueMicrotask.
        await Promise.resolve();
        await Promise.resolve();
        (document.getElementById('page-help-close') as HTMLButtonElement).click();
        expect(focusSpy).toHaveBeenCalled();
    });
});

/** Counts how many open-modal click listeners are wired on the trigger. */
function countOpenListeners(): number {
    const trigger = document.getElementById('test-help-btn') as HTMLButtonElement | null;
    if (!trigger) return 0;
    // We can't introspect listeners directly, so we synthesize a click and
    // count how many modals appear. Re-init must keep this at exactly 1.
    document.getElementById('page-help-modal')?.remove();
    trigger.click();
    return document.querySelectorAll('#page-help-modal').length;
}
