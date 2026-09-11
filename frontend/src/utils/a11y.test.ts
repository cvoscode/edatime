import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('initAccessibilityShortcuts', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('releases its global keyboard listener when disposed', async () => {
        const { initAccessibilityShortcuts } = await import('./a11y.js');
        const dispose = initAccessibilityShortcuts();
        dispose();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));

        expect(document.getElementById('keyboard-help-modal')).toBeNull();
    });
});

describe('keyboard shortcuts help', () => {
    beforeEach(() => {
        vi.resetModules();
        document.body.innerHTML = '<main><button id="return-focus">Open help</button></main>';
        (document.getElementById('return-focus') as HTMLButtonElement).focus();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('focuses searchable help and closes on Escape', async () => {
        const { showKeyboardShortcutsHelp } = await import('./a11y.js');
        showKeyboardShortcutsHelp();

        const search = document.getElementById('keyboard-help-search') as HTMLInputElement;
        expect(document.activeElement).toBe(search);

        search.value = 'save session';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const visibleRows = Array.from(document.querySelectorAll<HTMLElement>('.keyboard-shortcut-row'))
            .filter((row) => !row.hidden);
        expect(visibleRows).toHaveLength(1);
        expect(visibleRows[0]?.textContent).toContain('Save session');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('keyboard-help-modal')).toBeNull();
        expect(document.activeElement).toBe(document.getElementById('return-focus'));
    });

    it('surfaces Drift page shortcuts as a searchable page-specific group', async () => {
        const { showKeyboardShortcutsHelp } = await import('./a11y.js');
        showKeyboardShortcutsHelp();

        const sections = Array.from(document.querySelectorAll<HTMLElement>('.keyboard-help-section'));
        const drift = sections.find((section) => section.querySelector('h4')?.textContent === 'By page · Drift');
        expect(drift?.textContent).toContain('Run Drift analysis');
        expect(drift?.textContent).toContain('Export Drift CSV');
        expect(drift?.textContent).toContain('Enter / D');
    });
});
