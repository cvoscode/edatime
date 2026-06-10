/**
 * analyticsDrawer — right-side collapsible analytics panel for timeseries.
 * Toggles open/closed via toolbar button; saves state to preferences.
 */

import { updateSetting } from '../utils/settings.js';
import { createDrawerController } from './shell/createDrawerController';

const controller = createDrawerController({
    drawerId: 'analytics-drawer',
    toggleButtonIds: ['open-analytics-panel-btn'],
    onOpen: () => {
        updateSetting('analyticsDrawerOpen', true);
    },
    onClose: () => {
        updateSetting('analyticsDrawerOpen', false);
    },
});

export function initAnalyticsDrawer(): void {
    const closeButton = document.getElementById('analytics-close-btn') as HTMLButtonElement | null;
    if (closeButton && !closeButton.dataset.bound) {
        closeButton.addEventListener('click', controller.close);
        closeButton.dataset.bound = '1';
    }

    // Always normalize the runtime state on page load so a persisted
    // preference cannot leave the document in a stale interaction-blocking
    // state before the user explicitly opens the drawer again.
    controller.close();
    updateSetting('analyticsDrawerOpen', false);
}

export const openDrawer = controller.open;
export const closeDrawer = controller.close;
export const toggleDrawer = controller.toggle;
export { controller };
