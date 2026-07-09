/**
 * pageNavigation — sidebar navigation and page switching.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { preloadPageStyles } from '../utils/pageStyles.js';
import { pageNeedsDatasetBootstrap, resolveBackingPageName } from '../utils/pageBootstrap.js';
import { getHashPage } from '../utils/router.js';
import { dismissAllToasts } from '../utils/toast.js';

export interface PageNavigationDeps {
    ensureDatasetReady: (pageName?: string) => Promise<void>;
    ensurePageModuleLoaded: (pageName: string) => Promise<void>;
    ensureSubsystem: (name: string) => Promise<void>;
    openSettings: () => Promise<void>;
}

export interface PageNavigation {
    showPage(pageName: string): Promise<void>;
}

export function initPageNavigation(deps: PageNavigationDeps): PageNavigation {
    const navButtons = Array.from(document.querySelectorAll('.sidebar .nav-item[data-page]')) as HTMLElement[];
    const pages = Array.from(document.querySelectorAll('.page[data-page-name]')) as HTMLElement[];
    if (navButtons.length === 0 || pages.length === 0) {
        return { showPage: async () => {} };
    }
    const analyticsViews: Record<string, string> = {
        scatter: 'plot',
        scattermatrix: 'matrix',
    };

    const layout = document.querySelector('.app-layout') as HTMLElement | null;
    const collapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLElement | null;
    if (layout && collapseBtn && !collapseBtn.dataset.bound) {
        collapseBtn.addEventListener('click', () => {
            layout.classList.toggle('sidebar-collapsed');
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
        collapseBtn.dataset.bound = '1';
    }

    async function showPage(pageName: string) {
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
            window.dispatchEvent(
                new CustomEvent('edatime:page-change', {
                    detail: {
                        page: resolvedPageName,
                        navPage: pageName,
                        analyticsView,
                    },
                }),
            );
        });
    }

    for (const btn of navButtons) {
        btn.addEventListener('click', async () => { await showPage(btn.dataset.page!); });
    }

    void showPage(getHashPage() ?? 'home');
    return { showPage };
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
