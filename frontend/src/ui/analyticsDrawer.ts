/**
 * analyticsDrawer — right-side collapsible analytics panel for timeseries.
 * Toggles open/closed via toolbar button. The drawer is transient UI state.
 */

import { createDrawerController } from './shell/createDrawerController';

let controller: ReturnType<typeof createDrawerController> | null = null;
let disposeAnalyticsDrawer: (() => void) | null = null;

function getController() {
    if (!controller) {
        controller = createDrawerController({
            drawerId: 'analytics-drawer',
            toggleButtonIds: ['open-analytics-panel-btn'],
        });
    }
    return controller;
}

export function initAnalyticsDrawer(): () => void {
    if (disposeAnalyticsDrawer) return disposeAnalyticsDrawer;
    const activeController = getController();
    const closeButton = document.getElementById('analytics-close-btn') as HTMLButtonElement | null;
    closeButton?.addEventListener('click', activeController.close);

    // Always normalize runtime state before the user explicitly opens it.
    activeController.close();
    const dispose = () => {
        closeButton?.removeEventListener('click', activeController.close);
        activeController.dispose();
        controller = null;
        if (disposeAnalyticsDrawer === dispose) disposeAnalyticsDrawer = null;
    };
    disposeAnalyticsDrawer = dispose;
    return dispose;
}

export const openDrawer = () => getController().open();
export const closeDrawer = () => getController().close();
export const toggleDrawer = () => getController().toggle();
