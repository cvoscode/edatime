const APP_READY_ATTR = 'data-app-ready';
const APP_LOADING_OVERLAY_ID = 'app-loading-overlay';

function getLoadingOverlay(): HTMLElement | null {
    return document.getElementById(APP_LOADING_OVERLAY_ID);
}

export function markAppReady(): void {
    document.documentElement.setAttribute(APP_READY_ATTR, 'true');
    const overlay = getLoadingOverlay();
    if (overlay) overlay.hidden = true;
}

export function resetAppReady(): void {
    document.documentElement.removeAttribute(APP_READY_ATTR);
    const overlay = getLoadingOverlay();
    if (overlay) overlay.hidden = false;
}
