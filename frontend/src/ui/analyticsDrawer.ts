/**
 * analyticsDrawer — right-side collapsible analytics panel for timeseries.
 * Toggles open/closed via toolbar button. The drawer is transient UI state.
 */

import { createDrawerController } from './shell/createDrawerController';

const controller = createDrawerController({
    drawerId: 'analytics-drawer',
    toggleButtonIds: ['open-analytics-panel-btn'],
});

export function initAnalyticsDrawer(): void {
    const closeButton = document.getElementById('analytics-close-btn') as HTMLButtonElement | null;
    if (closeButton && !closeButton.dataset.bound) {
        closeButton.addEventListener('click', controller.close);
        closeButton.dataset.bound = '1';
    }

    // Always normalize runtime state before the user explicitly opens it.
    controller.close();
}

export const openDrawer = controller.open;
export const closeDrawer = controller.close;
export const toggleDrawer = controller.toggle;
export { controller };
