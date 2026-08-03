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
import { initPageNavigation, type PageNavigationDeps } from '../../ui/pageNavigation.js';
import { wireHomeNavigationCards } from '../../features/home/index.js';
import { initMobileHeaderMenu } from '../../ui/mobileHeaderMenu.js';
import { initActionProxies, initResponsiveDisclosures } from '../../ui/responsiveDisclosure.js';
import { initToolbarCollapse } from '../../ui/toolbarCollapse.js';

export interface ShellCoreInitDeps {
    showPage: (pageName: string) => void;
    navigation: PageNavigationDeps;
}

/**
 * Idempotent — safe to call more than once. Returns nothing; heavy
 * subsystems are NOT touched here; see `deferredSubsystems` for those.
 */
export function initShellCore(deps: ShellCoreInitDeps): () => void {
    normalizeFormControlAccessibility();
    const navigation = initPageNavigation(deps.navigation);
    const disposeHashRouting = initHashRouting(navigation.showPage);
    initSettings();
    const disposeThemeToggle = initThemeToggle();
    const disposeAccessibilityShortcuts = initAccessibilityShortcuts();
    const disposeKeyboardHelpButton = initKeyboardHelpButton();
    const disposeMobileHeaderMenu = initMobileHeaderMenu();
    const disposeResponsiveDisclosures = initResponsiveDisclosures();
    const disposeToolbarCollapse = initToolbarCollapse();
    const disposeActionProxies = initActionProxies();

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    if (layout && getSetting('sidebarCollapsed')) {
        layout.classList.add('sidebar-collapsed');
    }
    const disposeHomeNavigation = wireHomeNavigationCards(deps.showPage);

    return () => {
        disposeHomeNavigation();
        disposeMobileHeaderMenu();
        disposeResponsiveDisclosures();
        disposeToolbarCollapse();
        disposeActionProxies();
        disposeKeyboardHelpButton();
        disposeAccessibilityShortcuts();
        disposeThemeToggle();
        disposeHashRouting();
        navigation.dispose();
    };
}

function initKeyboardHelpButton(): () => void {
    const button = document.getElementById('keyboard-help-btn');
    if (!button) return () => {};
    button.addEventListener('click', showKeyboardShortcutsHelp);
    return () => button.removeEventListener('click', showKeyboardShortcutsHelp);
}
