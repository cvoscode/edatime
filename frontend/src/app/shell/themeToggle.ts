/**
 * Theme toggle binder.
 *
 * The toggle button is a pure event emitter: it reads the active setting, computes
 * the next explicit theme (always light or dark, never auto) and delegates the
 * persist + apply work to settings. There is no separate runtime here.
 */

import { applyTheme, loadSettings, saveSettings } from '../../utils/settings.js';

function nextTheme(current: 'light' | 'dark'): 'light' | 'dark' {
    return current === 'light' ? 'dark' : 'light';
}

/** Wire the header theme toggle button. Idempotent. */
export function initThemeToggle(): void {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    if (btn.dataset.edatimeThemeToggle === '1') return;
    btn.dataset.edatimeThemeToggle = '1';

    btn.addEventListener('click', () => {
        const settings = loadSettings();
        const current = settings.theme === 'light' ? 'light' : 'dark';
        const target = nextTheme(current);
        settings.theme = target;
        saveSettings(settings);
        applyTheme(target);
    });
}
