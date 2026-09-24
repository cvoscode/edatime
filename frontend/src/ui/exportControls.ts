/**
 * exportControls — toolbar modal wiring and zoom control actions.
 * Transport-layer calls (CSV/JSON/Parquet export) live in features/export/feature.ts.
 */

import { createModalController } from './shell/createModalController.js';

interface ToolbarPanel {
    openBtn: string;
    modalId: string;
    closeBtn: string;
    doneBtn: string | null;
}

export interface ToolbarModalActions {
    onZoomOut: () => void;
    onResetZoom: () => void;
}

export function initToolbarModals(actions: ToolbarModalActions): () => void {
    const lifetime = new AbortController();
    const cleanups: Array<() => void> = [];
    const panels: ToolbarPanel[] = [
        { openBtn: 'open-labels-panel-btn', modalId: 'chart-labels-modal', closeBtn: 'chart-labels-close-btn', doneBtn: 'chart-labels-done-btn' },
        { openBtn: 'open-export-options-btn', modalId: 'export-options-modal', closeBtn: 'export-options-close-btn', doneBtn: 'export-options-done-btn' },
    ];

    for (const panel of panels) {
        const controller = createModalController({
            modalId: panel.modalId,
            closeButtonIds: [panel.closeBtn, ...(panel.doneBtn ? [panel.doneBtn] : [])],
        });
        document.getElementById(panel.openBtn)?.addEventListener('click', controller.open, { signal: lifetime.signal });
        cleanups.push(controller.dispose);
    }

    document.getElementById('zoom-out-btn')?.addEventListener('click', actions.onZoomOut, { signal: lifetime.signal });
    document.getElementById('zoom-reset-btn')?.addEventListener('click', actions.onResetZoom, { signal: lifetime.signal });
    return () => {
        lifetime.abort();
        cleanups.forEach((cleanup) => cleanup());
    };
}
