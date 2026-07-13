import { createLifecycleScope } from './lifecycleScope.js';

// Shared page lifecycle wiring.
//
// Replaces repeated patterns like:
//   let initialized = false;
//   export async function initPage(deps) {
//       if (initialized) return;
//       initialized = true;
//       // ...setup...
//       window.addEventListener('edatime:page-change', handler);
//   }
//
// Supports two sub-patterns:
// - "always-react": init runs once, but the callback fires on *every* page-change
//   (useful when the page needs to re-render its chips/labels whenever any page is visited)
// - "visible-only": the callback only fires when the page being switched to matches
//   the registered page name
//
// Usage (fftPage style — always-react):
//   const lifecycle = createPageLifecycle({
//       page: 'fft',
//       init() {
//           // one-time setup
//       },
//       onEveryPageChange() {
//           // re-render chips on every page change
//       },
//   });
//
// Usage (heatmapPage style — visible-only):
//   const lifecycle = createPageLifecycle({
//       page: 'heatmap',
//       init() {
//           // one-time setup
//       },
//       onVisible() {
//           // only fires when user switches TO this page
//       },
//   });

export interface PageLifecycleOptions {
    /** Unique page name matched against edatime:page-change detail.page */
    page: string;
    /**
     * Called once on first trigger (either immediate or on first page-change).
     * Return a cleanup function if needed.
     */
    init(): (() => void) | void;
    /**
     * Optional: called on *every* edatime:page-change event, regardless of
     * which page is being switched to. Use for pages that need to
     * re-render shared UI (e.g., chips) on every navigation.
     */
    onEveryPageChange?: () => void;
    /**
     * Optional: called only when the registered page becomes visible.
     * Use for pages that only need to act when they are the active page.
     */
    onVisible?: () => void;
}

/**
 * Creates a page lifecycle manager.
 * Returns an explicit lifecycle handle. `activate()` handles a local first
 * visit without broadcasting a router event; `dispose()` releases listeners.
 */
export interface PageLifecycle {
    /** Activate this lifecycle without dispatching a global router event. */
    activate(): void;
    /** Remove lifecycle listeners and release the init cleanup, if any. */
    dispose(): void;
}

export function createPageLifecycle(options: PageLifecycleOptions): PageLifecycle {
    let initialized = false;
    const scope = createLifecycleScope();

    const activate = () => {
        if (!initialized) {
            initialized = true;
            const cleanup = options.init();
            if (typeof cleanup === 'function') scope.add(cleanup);
        }
        options.onVisible?.();
    };

    const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ page?: string }>).detail;
        const isTargetPage = detail?.page === options.page;

        if (isTargetPage) {
            activate();
        }
        options.onEveryPageChange?.();
    };

    scope.listen(window, 'edatime:page-change', handler);
    return { activate, dispose: () => scope.dispose() };
}
