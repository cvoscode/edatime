/**
 * timeseriesShortcuts — page-specific keyboard shortcuts for the timeseries view.
 *
 * Owned by Timeseries because these handlers depend on its fetch, viewport,
 * chart-export, and adaptive-filter actions.
 */

function isTypingTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if ((target as HTMLElement).isContentEditable) return true;
    const tag = String((target as HTMLElement).tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function currentPageName(): string {
    return (document.querySelector('.page[data-page-name]:not([hidden])') as HTMLElement | null)?.dataset?.pageName || 'upload';
}

export interface TimeseriesShortcutsDeps {
    fetchAndRender: () => Promise<void>;
    zoomOut: () => void;
    resetZoom: () => void;
    chartExportPng: () => void;
    exportFilteredCsv: () => void;
    exportFilteredJson: () => void;
}

export interface TimeseriesShortcutsController {
    mount(deps: TimeseriesShortcutsDeps): () => void;
}

/** Creates the keyboard-shortcut owner for one Timeseries module instance. */
export function createTimeseriesShortcuts(): TimeseriesShortcutsController {
    let disposeBinding: (() => void) | null = null;

    return {
        mount(deps) {
            if (disposeBinding) return disposeBinding;

            const onKeydown = (event: KeyboardEvent) => {
                if (event.defaultPrevented || isTypingTarget(event.target)) return;
                const key = String(event.key || '').toLowerCase();

                // Shift-only timeseries shortcuts (no Alt/Ctrl/Meta)
                if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

                if (key === 'r' && currentPageName() === 'timeseries') {
                    event.preventDefault();
                    deps.resetZoom();
                    void deps.fetchAndRender();
                    return;
                }
                if (key === 'z' && currentPageName() === 'timeseries') {
                    event.preventDefault();
                    deps.zoomOut();
                    void deps.fetchAndRender();
                    return;
                }
                if (key === 'c' && currentPageName() === 'timeseries') {
                    event.preventDefault();
                    document.getElementById('adaptive-clear-btn')?.click?.();
                    return;
                }
                if (key === 'p') {
                    event.preventDefault();
                    deps.chartExportPng();
                    return;
                }
                if (key === 'e') {
                    event.preventDefault();
                    if (currentPageName() === 'scatter') {
                        document.getElementById('scatter-export-csv-btn')?.click?.();
                    } else {
                        deps.exportFilteredCsv();
                    }
                }
            };

            window.addEventListener('keydown', onKeydown);
            disposeBinding = () => {
                if (!disposeBinding) return;
                window.removeEventListener('keydown', onKeydown);
                disposeBinding = null;
            };
            return disposeBinding;
        },
    };
}
