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
