/**
 * URL hash routing for EdaTime pages.
 *
 * Maps `#page=timeseries` ↔ sidebar navigation.
 * Supports browser back/forward and deep-link bookmarks.
 */

const VALID_PAGES = new Set([
    'home', 'upload', 'timeseries', 'correlations', 'scatter',
    'fft', 'heatmap', 'spectrogram', 'causal', 'drift', 'settings',
]);

// Aliases for renamed pages — old URL fragments still navigate correctly
const PAGE_ALIASES: Record<string, string> = {
    scattermatrix: 'scatter', // "Scatter Matrix" is now the matrix sub-view
};

let _bound = false;

/** Read the current page from the URL hash. Returns null if not set or invalid. */
export function getHashPage(): string | null {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const page = params.get('page');
    if (!page) return null;
    // Resolve aliases so old deep-links still work
    const resolved = PAGE_ALIASES[page] ?? page;
    return VALID_PAGES.has(resolved) ? resolved : null;
}

/** Resolve a page name, applying any aliases. */
export function resolvePageAlias(page: string): string {
    return PAGE_ALIASES[page] ?? page;
}

/** Write the page to the URL hash without triggering navigation. */
function setHashPage(page: string): void {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    params.set('page', page);
    const newHash = '#' + params.toString();
    if (location.hash !== newHash) {
        history.pushState(null, '', newHash);
    }
}

/** Replace hash without adding history entry (for initial load). */
function replaceHashPage(page: string): void {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    params.set('page', page);
    history.replaceState(null, '', '#' + params.toString());
}

/**
 * Bind hash routing to the page navigation system.
 *
 * Call once during app bootstrap, after `initPages()`.
 * Listens for `edatime:page-change` to update the hash,
 * and `popstate` to navigate on back/forward.
 */
export function initHashRouting(): void {
    if (_bound) return;
    _bound = true;

    // On page change → update hash
    window.addEventListener('edatime:page-change', ((e: CustomEvent) => {
        const page = e.detail?.navPage || e.detail?.page;
        if (page && VALID_PAGES.has(page)) {
            setHashPage(page);
        }
    }) as EventListener);

    // On browser back/forward → navigate to page
    window.addEventListener('popstate', () => {
        const page = getHashPage();
        if (page) {
            const btn = document.querySelector(`.sidebar .nav-item[data-page="${page}"]`) as HTMLElement | null;
            btn?.click();
        }
    });

    // On initial load → navigate to hash page, or set default
    const initialPage = getHashPage();
    if (initialPage) {
        // Defer to next frame so initPages has run first
        requestAnimationFrame(() => {
            const btn = document.querySelector(`.sidebar .nav-item[data-page="${initialPage}"]`) as HTMLElement | null;
            btn?.click();
        });
    } else {
        replaceHashPage('home');
    }
}
