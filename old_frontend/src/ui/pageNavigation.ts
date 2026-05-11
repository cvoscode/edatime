/**
 * pageNavigation — sidebar navigation and page switching.
 * Extracted from toolbar.ts to reduce its size and improve maintainability.
 */

import { preloadPageStyles } from '../utils/pageStyles.js';
import { pageNeedsDatasetBootstrap } from '../utils/pageBootstrap.js';

export function initPageNavigation(): void {
    const navButtons = Array.from(document.querySelectorAll('.sidebar .nav-item[data-page]')) as HTMLElement[];
    const pages = Array.from(document.querySelectorAll('.page[data-page-name]')) as HTMLElement[];
    if (navButtons.length === 0 || pages.length === 0) return;
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

        if (pageNeedsDatasetBootstrap(pageName)) {
            await (window as any).__edatime?.ensureDatasetReady?.(pageName);
        }

        if ((window as any).__edatime?.ensurePageModuleLoaded) {
            await (window as any).__edatime.ensurePageModuleLoaded(pageName);
        }

        const analyticsView = analyticsViews[pageName] || null;
        const resolvedPageName = analyticsView ? 'scatter' : pageName;

        for (const p of pages) {
            const hide = p.dataset.pageName !== resolvedPageName;
            p.hidden = hide;
            p.style.display = hide ? 'none' : 'flex';
        }
        for (const btn of navButtons) {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        }

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

    showPage('home');
}