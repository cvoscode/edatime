/**
 * analyticsDrawer — right-side collapsible analytics panel for timeseries.
 * Toggles open/closed via toolbar button; saves state to preferences.
 */

import { getSetting, updateSetting } from '../utils/settings.js';

let _open = false;

function isDrawerOpen(): boolean {
    return _open;
}

function openDrawer(): void {
    const drawer = document.getElementById('analytics-drawer');
    if (!drawer) return;
    drawer.hidden = false;
    document.body.classList.add('drawer-open');
    _open = true;
    updateSetting('analyticsDrawerOpen', true);
}

function closeDrawer(): void {
    const drawer = document.getElementById('analytics-drawer');
    if (!drawer) return;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
    _open = false;
    updateSetting('analyticsDrawerOpen', false);
}

function toggleDrawer(): void {
    if (isDrawerOpen()) closeDrawer();
    else openDrawer();
}

export function initAnalyticsDrawer(): void {
    const drawer = document.getElementById('analytics-drawer');
    if (!drawer) return;

    document.getElementById('analytics-close-btn')?.addEventListener('click', closeDrawer);

    drawer.addEventListener('click', (e) => {
        if ((e.target as HTMLElement) === drawer) closeDrawer();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
    });

    document.getElementById('open-analytics-panel-btn')?.addEventListener('click', toggleDrawer);

    const saved = getSetting('analyticsDrawerOpen');
    if (saved) openDrawer();
}

export { openDrawer, closeDrawer, toggleDrawer };