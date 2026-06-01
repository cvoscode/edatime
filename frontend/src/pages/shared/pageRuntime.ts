import { createPageLifecycle } from '../../app/pageLifecycle.js';
import {
    createEmptyStateController,
    type EmptyStateController,
    type EmptyStateViewModel,
} from '../../ui/emptyState.js';

export interface PageRuntimeOptions {
    page: string;
    emptyStateRootId?: string;
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
            emptyStateController = createEmptyStateController({ rootId: options.emptyStateRootId });
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
            if (el) el.hidden = loading;
        },
    };
}