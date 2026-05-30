import { createPageLifecycle } from '../../app/pageLifecycle.js';
import {
    createEmptyStateController,
    type EmptyStateController,
    type EmptyStateViewModel,
} from '../../ui/emptyState.js';
import { bindExportButtons, type ExportButtonConfig } from '../../utils/bindExportButtons.js';

export interface ExportConfig {
    key: string;
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}

export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    exportConfig?: ExportConfig;
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
                    if (options.exportConfig) {
                        bindExportButtons(options.exportConfig.key, {
                            png: options.exportConfig.png,
                            svg: options.exportConfig.svg,
                            html: options.exportConfig.html,
                            csv: options.exportConfig.csv,
                        });
                    }
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