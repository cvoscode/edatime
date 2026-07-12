import { createPageRuntime } from './pageRuntime.js';
import { bindExportButtons } from '../utils/bindExportButtons.js';

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
 * @property loadingElId       - Optional DOM id of the loading indicator element.
 * @property exportConfig      - Declarative export button configuration.
 * @property bindExportsOnInit - When true (default) bindExportButtons is called automatically
 *                               during the init phase. Set to false when the caller needs to
 *                               manage export binding itself.
 * @property init              - One-time setup called the first time the page is activated.
 * @property onVisible        - Called each time the registered page becomes visible.
 * @property onEveryPageChange - Called on every page-change event, regardless of target page.
 */
export interface AnalysisPageRuntimeOptions {
    page: string;
    emptyStateRootId: string;
    /**
     * Optional ids of `<strong id>` / `<span id>` inside the empty-state
     * root. When supplied, callers can populate the brand-illustrated
     * empty state (heading + body) without re-rendering its markup.
     */
    emptyStateTitleId?: string;
    emptyStateMessageId?: string;
    statusElId?: string;
    loadingElId?: string;
    exportConfig?: ExportConfig;
    bindExportsOnInit?: boolean;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}

export function createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions) {
    // Create base runtime
    const base = createPageRuntime({
        page: options.page,
        emptyStateRootId: options.emptyStateRootId,
        emptyStateTitleId: options.emptyStateTitleId,
        emptyStateMessageId: options.emptyStateMessageId,
        statusElId: options.statusElId,
        loadingElId: options.loadingElId,
        init: options.init,
        onVisible: options.onVisible,
        onEveryPageChange: options.onEveryPageChange,
    });

    const shouldBindOnInit = options.bindExportsOnInit ?? true;
    let bound = false;

    return {
        mount() {
            const unregister = base.mount();
            if (shouldBindOnInit && options.exportConfig) {
                bindExportButtons(options.exportConfig.key, {
                    png: options.exportConfig.png,
                    svg: options.exportConfig.svg,
                    html: options.exportConfig.html,
                    csv: options.exportConfig.csv,
                });
                bound = true;
            }
            return unregister;
        },
        updateEmptyState(model: import('../ui/emptyState.js').EmptyStateViewModel) {
            base.updateEmptyState(model);
        },
        updateStatus(text: string) {
            base.updateStatus(text);
        },
        setLoading(loading: boolean) {
            base.setLoading(loading);
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
