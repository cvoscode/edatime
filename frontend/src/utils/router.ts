/**
 * URL hash routing for EdaTime pages.
 *
 * Maps `#page=timeseries` ↔ sidebar navigation.
 * Supports browser back/forward and deep-link bookmarks.
 */

const VALID_PAGES = new Set([
    'home', 'upload', 'timeseries', 'prepare', 'correlations', 'scatter',
    'scattermatrix', 'fft', 'spectrogram', 'causal', 'drift', 'settings',
]);
import { onNavigationChange } from '../platform/navigationEvents.js';

let activeRouterDisposer: (() => void) | null = null;

export type PageNavigator = (page: string) => void | Promise<void>;

function normalizePage(page: string | null): string | null {
    const trimmed = String(page || '').trim();
    if (!trimmed) return null;
    return VALID_PAGES.has(trimmed) ? trimmed : null;
}

function getCanonicalPageUrl(page: string): string {
    return `${location.pathname}#page=${encodeURIComponent(page)}`;
}

function readHashPage(): string | null {
    const hash = location.hash.replace(/^#/, '');
    return normalizePage(new URLSearchParams(hash).get('page'));
}

function readQueryPage(): string | null {
    return normalizePage(new URLSearchParams(location.search).get('page'));
}

/** Read the current page from the URL hash. Returns null if not set or invalid. */
export function getHashPage(): string | null {
    return readHashPage() ?? readQueryPage();
}

/** Write the page to the URL hash without triggering navigation. */
function setHashPage(page: string): void {
    const nextPage = normalizePage(page);
    if (!nextPage) return;
    const nextUrl = getCanonicalPageUrl(nextPage);
    if (`${location.pathname}${location.search}${location.hash}` !== nextUrl) {
        history.pushState(null, '', nextUrl);
    }
}

/** Replace hash without adding history entry (for initial load). */
function replaceHashPage(page: string): void {
    const nextPage = normalizePage(page);
    if (!nextPage) return;
    history.replaceState(null, '', getCanonicalPageUrl(nextPage));
}

/**
 * Bind hash routing to the page navigation system.
 *
 * Call once during app bootstrap, after `initPages()`.
 * Listens for typed navigation changes to update the hash,
 * and `popstate` to navigate on back/forward.
 */
export function initHashRouting(navigateToPage: PageNavigator): () => void {
    if (activeRouterDisposer) return activeRouterDisposer;

    // On page change → update hash
    const unsubscribeNavigation = onNavigationChange((change) => {
        const page = change.navPage || change.page;
        if (page && VALID_PAGES.has(page)) {
            setHashPage(page);
        }
    });

    // On browser back/forward → navigate to page
    const onPopstate = () => {
        const page = getHashPage();
        if (page) void navigateToPage(page);
    };
    window.addEventListener('popstate', onPopstate);

    // initPageNavigation() already owns the first page show. The router's
    // responsibility on startup is only to canonicalize the URL so query-based
    // deep links become hash routes without triggering a second navigation.
    replaceHashPage(getHashPage() ?? 'home');

    const dispose = () => {
        unsubscribeNavigation();
        window.removeEventListener('popstate', onPopstate);
        if (activeRouterDisposer === dispose) activeRouterDisposer = null;
    };
    activeRouterDisposer = dispose;
    return dispose;
}
