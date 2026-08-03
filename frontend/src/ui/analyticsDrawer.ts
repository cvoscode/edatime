/**
 * Legacy analyticsDrawer entrypoint for the Signals analytics modal.
 * The filename stays stable for deferred imports while the UI uses the shared
 * accessible modal behavior used by the other chart tools.
 */

import { createModalController } from './shell/createModalController';

let controller: ReturnType<typeof createModalController> | null = null;
let disposeAnalyticsDrawer: (() => void) | null = null;
let modalOpen = false;

function getController() {
    if (!controller) {
        controller = createModalController({
            modalId: 'signals-analytics-modal',
            closeButtonIds: ['analytics-close-btn', 'analytics-done-btn'],
            onOpen: () => { modalOpen = true; },
            onClose: () => { modalOpen = false; },
        });
    }
    return controller;
}

export function initAnalyticsDrawer(): () => void {
    if (disposeAnalyticsDrawer) return disposeAnalyticsDrawer;
    const modal = document.getElementById('signals-analytics-modal');
    if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
    const activeController = getController();
    const openButton = document.getElementById('open-analytics-panel-btn') as HTMLButtonElement | null;
    const nestedToolButtons = ['transform-open-btn', 'outlier-open-btn']
        .map((id) => document.getElementById(id))
        .filter((button): button is HTMLElement => !!button);
    openButton?.addEventListener('click', activeController.open);
    for (const button of nestedToolButtons) {
        button.addEventListener('click', activeController.close, { capture: true });
    }

    // Remove stale state left by older builds that rendered this tool as a drawer.
    document.body.classList.remove('drawer-open');
    const dispose = () => {
        openButton?.removeEventListener('click', activeController.open);
        for (const button of nestedToolButtons) {
            button.removeEventListener('click', activeController.close, { capture: true });
        }
        activeController.dispose();
        controller = null;
        modalOpen = false;
        if (disposeAnalyticsDrawer === dispose) disposeAnalyticsDrawer = null;
    };
    disposeAnalyticsDrawer = dispose;
    return dispose;
}

export const openDrawer = () => getController().open();
export const closeDrawer = () => getController().close();
export const toggleDrawer = () => modalOpen ? getController().close() : getController().open();

export const openAnalyticsModal = openDrawer;
export const closeAnalyticsModal = closeDrawer;
