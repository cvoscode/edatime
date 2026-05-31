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
    /**
     * When true (the default), bindExportButtons is called automatically during
     * the init phase so that export closures capture fresh state on mount.
     * Set to false when the caller needs to manage export binding itself —
     * for example, when the csv dataCheck closure must capture a live module
     * reference that is not yet populated at mount time.
     */
    bindExportsOnInit?: boolean;
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

    // Default to true for backward compatibility.
    const bindExports = options.bindExportsOnInit ?? true;

    return {
        mount() {
            return createPageLifecycle({
                page: options.page,
                init() {
                    if (bindExports && options.exportConfig) {
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