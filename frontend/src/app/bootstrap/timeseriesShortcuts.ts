/**
 * timeseriesShortcuts — page-specific keyboard shortcuts for the timeseries view.
 *
 * Extracted from app.ts because these handlers depend on timeseries-specific
 * closures (fetchAndRender, zoomOut, resetZoom, appState.chart, etc.) that
 * cannot be centralized in globalShortcuts.ts without creating a circular
 * dependency on app.ts lifecycle.
 *
 * The Alt+1..0 navigation shortcuts live in globalShortcuts.ts via APP_COMMAND_DEFINITIONS.
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
    registerCleanup: (cleanup: () => void) => void;
}

export function initTimeseriesShortcuts(deps: TimeseriesShortcutsDeps): void {
    const win = window as Window & typeof globalThis;
    if (win.__edatime?.timeseriesShortcutsBound) return;
    if (!win.__edatime) win.__edatime = {};

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
            return;
        }
    };

    win.addEventListener('keydown', onKeydown);
    deps.registerCleanup(() => win.removeEventListener('keydown', onKeydown));
    win.__edatime.timeseriesShortcutsBound = true;
}