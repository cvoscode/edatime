/**
 * Theme toggle binder.
 *
 * The toggle button is a pure event emitter: it reads the active setting, computes
 * the next explicit theme (always light or dark, never auto) and delegates the
 * persist + apply work to settings. There is no separate runtime here.
 */

import { applyTheme, loadSettings, saveSettings, type ThemeMode } from '../../utils/settings.js';

function nextTheme(current: ThemeMode): ThemeMode {
    const themes: ThemeMode[] = ['dark', 'light', 'high-contrast', 'colorblind'];
    const index = themes.indexOf(current);
    return themes[(index + 1) % themes.length]!;
}

/** Wire the header theme toggle button. */
export function initThemeToggle(): () => void {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn || btn.dataset.edatimeThemeToggle === '1') return () => {};
    btn.dataset.edatimeThemeToggle = '1';

    const onClick = () => {
        const settings = loadSettings();
        const target = nextTheme(settings.theme);
        settings.theme = target;
        saveSettings(settings);
        applyTheme(target);
        btn.setAttribute('title', `Theme: ${target.replace('-', ' ')}. Click for the next theme.`);
    };
    btn.addEventListener('click', onClick);
    return () => {
        btn.removeEventListener('click', onClick);
        delete btn.dataset.edatimeThemeToggle;
    };
}
