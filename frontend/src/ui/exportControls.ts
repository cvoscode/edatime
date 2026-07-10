/**
 * exportControls — toolbar modal wiring and zoom control click dispatch.
 * Transport-layer calls (CSV/JSON/Parquet export) moved to features/export/entrypoint.ts.
 *
 * The `#zoom-out-btn` and `#zoom-reset-btn` clicks dispatch `edatime:zoom-out`
 * and `edatime:reset-zoom` events respectively. The real `fetchAndRender`
 * callback is wired to those events by `initZoomOutListener` /
 * `initResetZoomListener` in `viewport.ts`. Calling `zoomOut` / `resetZoom`
 * directly here would be unsafe: this module has no access to the page
 * module's `fetchAndRender`, so doing so would silently break zoom-out
 * (the chart store would update but the chart would never refetch the
 * data for the new range, leaving the canvas empty).
 */

import { createExportFeature, type ExportFeature, type ExportFeatureDeps } from '../features/export/entrypoint.js';

let exportFeature: ExportFeature | null = null;

/** Configures export actions with app-owned workspace intent and fetched data. */
export function configureExportControls(deps: ExportFeatureDeps): void {
    exportFeature = createExportFeature(deps);
}

export function exportChartFilteredData(format: 'csv' | 'json' = 'csv'): boolean {
    if (!exportFeature) return false;
    if (format === 'json') return exportFeature.exportFilteredJson();
    return exportFeature.exportFilteredCsv();
}

export async function exportChartFilteredParquet(): Promise<boolean> {
    return exportFeature?.exportFilteredParquet() ?? false;
}

function openToolbarModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = false;
}

function closeToolbarModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
}

interface ToolbarPanel {
    openBtn: string;
    modalId: string;
    closeBtn: string;
    doneBtn: string | null;
    isDrawer?: boolean;
}

export function initToolbarModals(): void {
    const panels: ToolbarPanel[] = [
        { openBtn: 'open-labels-panel-btn', modalId: 'chart-labels-modal', closeBtn: 'chart-labels-close-btn', doneBtn: 'chart-labels-done-btn' },
        { openBtn: 'open-export-options-btn', modalId: 'export-options-modal', closeBtn: 'export-options-close-btn', doneBtn: 'export-options-done-btn' },
        { openBtn: 'open-analytics-panel-btn', modalId: 'analytics-drawer', closeBtn: 'analytics-close-btn', doneBtn: null, isDrawer: true },
    ];

    for (const panel of panels) {
        const openButton = document.getElementById(panel.openBtn);
        if (openButton && !openButton.dataset.bound) {
            openButton.addEventListener('click', () => {
                if (panel.isDrawer) return; // analytics handled by analyticsDrawer
                openToolbarModal(panel.modalId);
            });
            openButton.dataset.bound = '1';
        }

        if (panel.isDrawer) continue; // skip modal logic for drawer

        const closeButton = document.getElementById(panel.closeBtn);
        if (closeButton && !closeButton.dataset.bound) {
            closeButton.addEventListener('click', () => closeToolbarModal(panel.modalId));
            closeButton.dataset.bound = '1';
        }

        if (panel.doneBtn) {
            const doneButton = document.getElementById(panel.doneBtn);
            if (doneButton && !doneButton.dataset.bound) {
                doneButton.addEventListener('click', () => closeToolbarModal(panel.modalId));
                doneButton.dataset.bound = '1';
            }
        }

        const modal = document.getElementById(panel.modalId);
        if (modal && !modal.dataset.bound) {
            modal.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).id === panel.modalId) closeToolbarModal(panel.modalId);
            });
            modal.dataset.bound = '1';
        }
    }

    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('edatime:zoom-out', { detail: { source: 'toolbar' } }));
    });
    document.getElementById('zoom-reset-btn')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('edatime:reset-zoom', { detail: { source: 'toolbar' } }));
    });
}
