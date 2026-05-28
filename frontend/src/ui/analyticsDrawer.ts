/**
 * analyticsDrawer — right-side collapsible analytics panel for timeseries.
 * Toggles open/closed via toolbar button; saves state to preferences.
 */

import { getSetting, updateSetting } from '../utils/settings.js';
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
    document.getElementById('analytics-close-btn')?.addEventListener('click', controller.close);

    const saved = getSetting('analyticsDrawerOpen');
    if (saved) controller.open();
}

export const openDrawer = controller.open;
export const closeDrawer = controller.close;
export const toggleDrawer = controller.toggle;
export { controller };