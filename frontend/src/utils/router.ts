/**
 * URL hash routing for EdaTime pages.
 *
 * Maps `#page=timeseries` ↔ sidebar navigation.
 * Supports browser back/forward and deep-link bookmarks.
 */

const VALID_PAGES = new Set([
    'home', 'upload', 'timeseries', 'correlations', 'scatter',
    'scattermatrix', 'fft', 'heatmap', 'spectrogram', 'causal', 'drift', 'settings',
]);

let _bound = false;

type AppWindow = Window & typeof globalThis & {
    __edatime?: {
        showPage?: (pageName: string) => void;
    };
};

/** Read the current page from the URL hash. Returns null if not set or invalid. */
export function getHashPage(): string | null {
    const hash = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const page = params.get('page');
    if (!page) return null;
    return VALID_PAGES.has(page) ? page : null;
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

function navigateToPage(page: string): void {
    const win = window as AppWindow;
    if (win.__edatime?.showPage) {
        win.__edatime.showPage(page);
        return;
    }
    const btn = document.querySelector(`.sidebar .nav-item[data-page="${page}"]`) as HTMLElement | null;
    btn?.click();
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
        if (page) navigateToPage(page);
    });

    // On initial load → navigate to hash page, or set default
    const initialPage = getHashPage();
    if (initialPage) {
        // Defer to next frame so initPages has run first
        requestAnimationFrame(() => {
            navigateToPage(initialPage);
        });
    } else {
        replaceHashPage('home');
    }
}
