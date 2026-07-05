const APP_READY_ATTR = 'data-app-ready';
const BODY_BUSY_ATTR = 'aria-busy';

function setBodyBusy(isBusy: boolean): void {
    document.body.setAttribute(BODY_BUSY_ATTR, isBusy ? 'true' : 'false');
}

export function markAppReady(): void {
    document.documentElement.setAttribute(APP_READY_ATTR, 'true');
    setBodyBusy(false);
}

export function resetAppReady(): void {
    document.documentElement.removeAttribute(APP_READY_ATTR);
    setBodyBusy(true);
}
