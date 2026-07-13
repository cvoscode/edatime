/**
 * exportControls — toolbar modal wiring and zoom control actions.
 * Transport-layer calls (CSV/JSON/Parquet export) live in features/export/feature.ts.
 */

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

export interface ToolbarModalActions {
    onZoomOut: () => void;
    onResetZoom: () => void;
}

export function initToolbarModals(actions: ToolbarModalActions): void {
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

    const zoomOutButton = document.getElementById('zoom-out-btn');
    if (zoomOutButton && !zoomOutButton.dataset.bound) {
        zoomOutButton.addEventListener('click', actions.onZoomOut);
        zoomOutButton.dataset.bound = '1';
    }
    const resetZoomButton = document.getElementById('zoom-reset-btn');
    if (resetZoomButton && !resetZoomButton.dataset.bound) {
        resetZoomButton.addEventListener('click', actions.onResetZoom);
        resetZoomButton.dataset.bound = '1';
    }
}
