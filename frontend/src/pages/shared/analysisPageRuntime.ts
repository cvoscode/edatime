import { createPageLifecycle } from '../../app/pageLifecycle.js';
import {
    createEmptyStateController,
    type EmptyStateController,
    type EmptyStateViewModel,
} from '../../ui/emptyState.js';

export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    bindExports?: () => void;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}

export function createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions) {
    let emptyState: EmptyStateController | null = null;
    const getEmptyState = () => {
        if (!emptyState) {
            emptyState = createEmptyStateController({ rootId: options.emptyStateRootId });
        }
        return emptyState;
    };

    return {
        mount() {
            return createPageLifecycle({
                page: options.page,
                init() {
                    options.bindExports?.();
                    return options.init?.();
                },
                onVisible: options.onVisible,
                onEveryPageChange: options.onEveryPageChange,
            });
        },
        updateEmptyState(model: EmptyStateViewModel) {
            getEmptyState().update(model);
        },
    };
}