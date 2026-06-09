/**
 * Shell core initialization.
 *
 * Always-on setup that is required for the application shell to render
 * correctly. These subsystems are cheap (no chart / arrow / scatter
 * dependencies) and must be ready before the first paint.
 *
 * Heavier UI subsystems (upload, analytics, annotations, guided workflow,
 * transform / outlier modals, provenance) live in `deferredSubsystems`
 * and are pulled in lazily via the small contract in this file.
 */

import { normalizeFormControlAccessibility } from './a11yNormalization.js';
import { initSettings, getSetting } from '../../utils/settings.js';
import { initThemeToggle } from './themeToggle.js';
import { initAccessibilityShortcuts, showKeyboardShortcutsHelp } from '../../utils/a11y.js';
import { initHashRouting } from '../../utils/router.js';
import { initPages } from '../../ui/toolbar.js';
import { wireHomeNavigationCards } from './homeNavigation.js';

export interface ShellCoreInitDeps {
    showPage: (pageName: string) => void;
}

/**
 * Idempotent — safe to call more than once. Returns nothing; heavy
 * subsystems are NOT touched here; see `deferredSubsystems` for those.
 */
export function initShellCore(deps: ShellCoreInitDeps): void {
    normalizeFormControlAccessibility();
    initPages();
    initHashRouting();
    initSettings();
    initThemeToggle();
    initAccessibilityShortcuts();
    initKeyboardHelpButton();

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    if (layout && getSetting('sidebarCollapsed')) {
        layout.classList.add('sidebar-collapsed');
    }
    wireHomeNavigationCards(deps.showPage);
}

function initKeyboardHelpButton(): void {
    document.getElementById('keyboard-help-btn')?.addEventListener('click', showKeyboardShortcutsHelp);
}
