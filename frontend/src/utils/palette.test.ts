import { afterEach, describe, expect, it } from 'vitest';
import { initCommandPalette } from './palette.js';

describe('command palette lifecycle', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('removes the global shortcut and overlay on disposal', () => {
        const dispose = initCommandPalette();
        dispose();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

        expect(document.querySelector('.palette-overlay')).toBeNull();
    });
});
