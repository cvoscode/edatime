import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTheme } from './settings.js';
import { getResolvedTheme, onThemeChange, setResolvedTheme } from './theme.js';

describe('applyTheme', () => {
    beforeEach(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.innerHTML = `
            <span id="theme-icon-dark"></span>
            <span id="theme-icon-light" hidden></span>
        `;
        setResolvedTheme('dark');
    });

    it('updates resolved theme subscribers when switching themes', () => {
        const listener = vi.fn();
        const unsubscribe = onThemeChange(listener);
        listener.mockClear();

        applyTheme('light');

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(getResolvedTheme()).toBe('light');
        expect(listener).toHaveBeenCalledWith('light');
        expect((document.getElementById('theme-icon-dark') as HTMLElement).hidden).toBe(true);
        expect((document.getElementById('theme-icon-light') as HTMLElement).hidden).toBe(false);

        unsubscribe();
    });
});
