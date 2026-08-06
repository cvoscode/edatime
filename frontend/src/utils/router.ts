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
function setHashPage(page: string): boolean {
    const nextPage = normalizePage(page);
    if (!nextPage) return false;
    const nextUrl = getCanonicalPageUrl(nextPage);
    if (`${location.pathname}${location.search}${location.hash}` !== nextUrl) {
        history.pushState(null, '', nextUrl);
        return true;
    }
    return false;
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
    const initialHash = location.hash;
    let lastInternalHash = initialHash;

    // On page change → update hash
    const unsubscribeNavigation = onNavigationChange((change) => {
        const page = change.navPage || change.page;
        if (page && VALID_PAGES.has(page)) {
            const urlChanged = setHashPage(page);
            if (urlChanged) lastInternalHash = location.hash;
            const activeNavPage = document.querySelector<HTMLElement>('.nav-item.active[data-page]')?.dataset.page;
            // History APIs do not emit hashchange/popstate. If a caller emits a
            // navigation event for the current hash while the shell is stale,
            // explicitly replay the route instead of leaving the wrong section
            // visible.
            if (!urlChanged && activeNavPage !== page) void navigateToPage(page);
        }
    });

    // On browser back/forward, direct hash writes, or a restored page →
    // activate the section represented by the URL.
    const activateHashRoute = () => {
        const page = getHashPage();
        if (page) void navigateToPage(page);
    };
    const onHashchange = (event: HashChangeEvent) => {
        let eventHash = '';
        try {
            eventHash = event.newURL ? new URL(event.newURL).hash : '';
        } catch {
            // A synthetic event may omit or provide a non-URL newURL.
        }
        // Ignore delayed events for an older hash. This also prevents the
        // initial canonical hash from replaying a page init already owned by
        // initPageNavigation().
        if ((eventHash && eventHash !== location.hash)
            || location.hash === lastInternalHash
            || (location.hash === initialHash && (!eventHash || eventHash === initialHash))) return;
        activateHashRoute();
    };
    const onPageshow = (event: PageTransitionEvent) => {
        if (event.persisted) activateHashRoute();
    };
    window.addEventListener('popstate', activateHashRoute);
    window.addEventListener('hashchange', onHashchange);
    window.addEventListener('pageshow', onPageshow);

    // initPageNavigation() already owns the first page show. The router's
    // responsibility on startup is only to canonicalize the URL so query-based
    // deep links become hash routes without triggering a second navigation.
    replaceHashPage(getHashPage() ?? 'home');
    lastInternalHash = location.hash;

    const dispose = () => {
        unsubscribeNavigation();
        window.removeEventListener('popstate', activateHashRoute);
        window.removeEventListener('hashchange', onHashchange);
        window.removeEventListener('pageshow', onPageshow);
        if (activeRouterDisposer === dispose) activeRouterDisposer = null;
    };
    activeRouterDisposer = dispose;
    return dispose;
}
