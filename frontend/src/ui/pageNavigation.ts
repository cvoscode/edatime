/**
 * pageNavigation — sidebar navigation and page switching.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { preloadPageStyles } from '../utils/pageStyles.js';
import { pageNeedsDatasetBootstrap, resolveBackingPageName } from '../utils/pageBootstrap.js';
import { getHashPage } from '../utils/router.js';
import { dismissAllToasts } from '../utils/toast.js';
import { emitNavigationChange } from '../platform/navigationEvents.js';

export interface PageNavigationDeps {
    ensureDatasetReady: (pageName?: string) => Promise<void>;
    ensurePageModuleLoaded: (pageName: string) => Promise<void>;
    ensureSubsystem: (name: string) => Promise<void>;
    openSettings: () => Promise<void>;
}

export interface PageNavigation {
    showPage(pageName: string): Promise<void>;
    dispose(): void;
}

export function initPageNavigation(deps: PageNavigationDeps): PageNavigation {
    const listenerController = new AbortController();
    const navButtons = Array.from(document.querySelectorAll('.sidebar .nav-item[data-page]')) as HTMLElement[];
    const pages = Array.from(document.querySelectorAll('.page[data-page-name]')) as HTMLElement[];
    if (navButtons.length === 0 || pages.length === 0) {
        return { showPage: async () => { }, dispose: () => { } };
    }
    const analyticsViews: Record<string, string> = {
        scatter: 'plot',
        scattermatrix: 'matrix',
    };

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    const collapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLElement | null;
    const mobileToggleBtn = document.getElementById('mobile-sidebar-toggle-btn') as HTMLButtonElement | null;
    const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop') as HTMLButtonElement | null;
    const sidebar = document.getElementById('sidebar');
    const appContent = document.querySelector('.app-content') as HTMLElement | null;
    let ownsCollapseBinding = false;
    let drawerReturnFocus: HTMLElement | null = null;

    const isMobileViewport = () => window.matchMedia('(max-width: 640px)').matches;
    const setMobileDrawerOpen = (open: boolean) => {
        if (!layout) return;
        if (open) drawerReturnFocus = document.activeElement as HTMLElement | null;
        layout.dataset.sidebarOpen = open ? 'true' : 'false';
        mobileToggleBtn?.setAttribute('aria-expanded', String(open));
        mobileToggleBtn?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        mobileToggleBtn?.setAttribute('title', open ? 'Close navigation' : 'Open navigation');
        mobileBackdrop?.toggleAttribute('hidden', !open);
        appContent?.toggleAttribute('inert', open);
        document.body.classList.toggle('mobile-nav-open', open);
        if (open) {
            queueMicrotask(() => sidebar?.querySelector<HTMLElement>('.nav-item:not([disabled])')?.focus());
        }
    };

    if (layout && collapseBtn && !collapseBtn.dataset.bound) {
        collapseBtn.addEventListener('click', () => {
            if (isMobileViewport()) {
                setMobileDrawerOpen(false);
            } else {
                const collapsed = layout.classList.toggle('sidebar-collapsed');
                collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
                collapseBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
            }
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        }, { signal: listenerController.signal });
        collapseBtn.dataset.bound = '1';
        ownsCollapseBinding = true;
    }

    if (layout && mobileToggleBtn && !mobileToggleBtn.dataset.bound) {
        mobileToggleBtn.addEventListener('click', () => {
            setMobileDrawerOpen(layout.dataset.sidebarOpen !== 'true');
        }, { signal: listenerController.signal });
        mobileToggleBtn.dataset.bound = '1';
    }

    mobileBackdrop?.addEventListener('click', () => {
        setMobileDrawerOpen(false);
        (drawerReturnFocus ?? mobileToggleBtn)?.focus();
    }, { signal: listenerController.signal });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && layout?.dataset.sidebarOpen === 'true') {
            event.preventDefault();
            setMobileDrawerOpen(false);
            (drawerReturnFocus ?? mobileToggleBtn)?.focus();
            return;
        }
        if (event.key === 'Tab' && layout?.dataset.sidebarOpen === 'true' && sidebar) {
            const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }, { signal: listenerController.signal });

    document.addEventListener('pointerdown', (event) => {
        if (!isMobileViewport() || layout?.dataset.sidebarOpen !== 'true') return;
        const target = event.target as Node | null;
        if (target && !sidebar?.contains(target) && !mobileToggleBtn?.contains(target)) {
            setMobileDrawerOpen(false);
        }
    }, { signal: listenerController.signal });

    window.addEventListener('resize', () => {
        if (!isMobileViewport() && layout?.dataset.sidebarOpen === 'true') setMobileDrawerOpen(false);
    }, { signal: listenerController.signal });

    async function showPage(pageName: string) {
        if (isMobileViewport()) setMobileDrawerOpen(false);
        preloadPageStyles(pageName);
        const backingPageName = resolveBackingPageName(pageName) ?? pageName;

        if (pageName === 'settings') {
            await deps.openSettings();
            return;
        }

        if (backingPageName === 'home') {
            await deps.ensureSubsystem('home');
        } else if (backingPageName === 'upload') {
            await deps.ensureSubsystem('upload');
        } else if (backingPageName === 'timeseries') {
            await deps.ensureSubsystem('timeseries-shell');
        }

        if (pageNeedsDatasetBootstrap(backingPageName)) {
            await deps.ensureDatasetReady(backingPageName);
        }

        await deps.ensurePageModuleLoaded(backingPageName);

        const analyticsView = analyticsViews[pageName] || null;
        const resolvedPageName = backingPageName;

        for (const p of pages) {
            const hide = p.dataset.pageName !== resolvedPageName;
            p.hidden = hide;
            p.style.display = hide ? 'none' : 'flex';
        }
        for (const btn of navButtons) {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        }

        dismissAllToasts();

        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            emitNavigationChange({ page: resolvedPageName, navPage: pageName, analyticsView });
        });
    }

    for (const btn of navButtons) {
        btn.addEventListener('click', async () => { await showPage(btn.dataset.page!); }, { signal: listenerController.signal });
    }

    void showPage(getHashPage() ?? 'home');
    return {
        showPage,
        dispose: () => {
            setMobileDrawerOpen(false);
            listenerController.abort();
            if (ownsCollapseBinding) delete collapseBtn?.dataset.bound;
            delete mobileToggleBtn?.dataset.bound;
        },
    };
}

/**
 * Sync active state on the sidebar navigation.
 * Call this whenever the current page changes so the nav reflects the active page.
 */
export function syncActivePageNav(page: string): void {
    document.querySelectorAll<HTMLElement>('.sidebar .nav-item[data-page]').forEach((el) => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}
