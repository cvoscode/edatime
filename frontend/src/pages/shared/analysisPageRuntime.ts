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

/**
 * Options for creating an analysis-page runtime.
 *
 * @property page              - Unique page name matched against `edatime:page-change` detail.page.
 * @property emptyStateRootId  - DOM id of the empty-state container element.
 * @property statusElId        - Optional DOM id of the page's status text element.
 *                               When provided the runtime gains a `updateStatus()` method
 *                               so callers do not need to query the DOM themselves.
 * @property exportConfig      - Declarative export button configuration.
 * @property bindExportsOnInit - When true (default) bindExportButtons is called automatically
 *                               during the init phase. Set to false when the caller needs to
 *                               manage export binding itself (e.g., when the csv dataCheck closure
 *                               must capture a live module reference not yet populated at mount time).
 * @property init              - One-time setup called the first time the page is activated.
 * @property onVisible        - Called each time the registered page becomes visible.
 * @property onEveryPageChange - Called on every page-change event, regardless of target page.
 */
export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    statusElId?: string;
    exportConfig?: ExportConfig;
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

    const shouldBindOnInit = options.bindExportsOnInit ?? true;
    let bound = false;

    /** Lazily-resolved status element. */
    const getStatusEl = (): HTMLElement | null =>
        options.statusElId ? document.getElementById(options.statusElId) : null;

    return {
        mount() {
            return createPageLifecycle({
                page: options.page,
                init() {
                    if (shouldBindOnInit && options.exportConfig) {
                        bindExportButtons(options.exportConfig.key, {
                            png: options.exportConfig.png,
                            svg: options.exportConfig.svg,
                            html: options.exportConfig.html,
                            csv: options.exportConfig.csv,
                        });
                        bound = true;
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
        /**
         * Write text to the status element, if one was configured.
         * Clears the element when called with an empty string.
         */
        updateStatus(text: string) {
            const el = getStatusEl();
            if (el) el.textContent = text;
        },

        /**
         * Bind export buttons using the configured exportConfig.
         * Idempotent — calling multiple times only binds once.
         * Use this for deferred binding when `bindExportsOnInit` is false.
         */
        bindExports() {
            if (!options.exportConfig) return;
            if (bound) return;
            bound = true;
            bindExportButtons(options.exportConfig.key, {
                png: options.exportConfig.png,
                svg: options.exportConfig.svg,
                html: options.exportConfig.html,
                csv: options.exportConfig.csv,
            });
        },
    };
}
