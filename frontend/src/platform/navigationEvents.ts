/** Typed in-process navigation boundary owned by the router. */
export interface NavigationChange {
    page: string;
    navPage?: string;
    analyticsView?: string | null;
}

const TARGET_KEY = '__edatimeNavigationEventTarget';
const navigationHost = globalThis as typeof globalThis & {
    [TARGET_KEY]?: EventTarget;
};
const navigationTarget = navigationHost[TARGET_KEY] ??= new EventTarget();
const NAVIGATION_CHANGE = 'change';

export function emitNavigationChange(change: NavigationChange): void {
    navigationTarget.dispatchEvent(new CustomEvent<NavigationChange>(NAVIGATION_CHANGE, { detail: change }));
}

export function onNavigationChange(listener: (change: NavigationChange) => void): () => void {
    const handler = (event: Event) => listener((event as CustomEvent<NavigationChange>).detail);
    navigationTarget.addEventListener(NAVIGATION_CHANGE, handler);
    return () => navigationTarget.removeEventListener(NAVIGATION_CHANGE, handler);
}
