import { createPageLifecycle } from '../../app/pageLifecycle.js';
import {
    createEmptyStateController,
    type EmptyStateController,
    type EmptyStateViewModel,
} from '../../ui/emptyState.js';

export interface PageRuntimeOptions {
    page: string;
    emptyStateRootId?: string;
    /**
     * Optional ids of the `<strong id="…">` and `<span id="…">` elements
     * inside the empty-state root. When provided, the runtime updates
     * them in place so a brand-illustrated empty state (heading + body)
     * can be wired up without re-rendering the surrounding markup.
     */
    emptyStateTitleId?: string;
    emptyStateMessageId?: string;
    statusElId?: string;
    loadingElId?: string;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}

interface PageRuntime {
    mount(): () => void;
    updateEmptyState(model: EmptyStateViewModel): void;
    updateStatus(text: string): void;
    setLoading(loading: boolean): void;
}

export function createPageRuntime(options: PageRuntimeOptions): PageRuntime {
    let emptyStateController: EmptyStateController | null = null;
    let cleanup: (() => void) | void;
    let mounted = false;

    const getEmptyState = (): EmptyStateController => {
        if (!emptyStateController && options.emptyStateRootId) {
            emptyStateController = createEmptyStateController({
                rootId: options.emptyStateRootId,
                titleId: options.emptyStateTitleId,
                messageId: options.emptyStateMessageId,
            });
        }
        return emptyStateController!;
    };

    return {
        mount(): () => void {
            if (mounted) return () => {};
            mounted = true;

            const unregister = createPageLifecycle({
                page: options.page,
                init: () => {
                    cleanup = options.init?.();
                },
                onVisible: options.onVisible,
                onEveryPageChange: options.onEveryPageChange,
            });

            return () => {
                unregister();
                if (typeof cleanup === 'function') cleanup();
            };
        },

        updateEmptyState(model: EmptyStateViewModel): void {
            if (!options.emptyStateRootId) return;
            getEmptyState().update(model);
        },

        updateStatus(text: string): void {
            if (!options.statusElId) return;
            const el = document.getElementById(options.statusElId);
            if (el) el.textContent = text;
        },

        setLoading(loading: boolean): void {
            if (!options.loadingElId) return;
            const el = document.getElementById(options.loadingElId);
            // Loading=true means the loading element is *visible* (showing the
            // loading indicator). Loading=false hides it once work finishes.
            if (el) el.hidden = !loading;
        },
    };
}