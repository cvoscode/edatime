/**
 * Shared debug utilities.
 * Enable via `?debug=1` query param or `localStorage.edatimeDebug = '1'`.
 */

export const DEBUG: boolean = (() => {
    try {
        const qs = new URLSearchParams(window.location.search);
        if (qs.get('debug') === '1') return true;
        if (qs.get('debug') === 'true') return true;
        return window.localStorage?.getItem('edatimeDebug') === '1';
    } catch {
        return false;
    }
})();

export function dbg(...args: unknown[]): void {
    if (!DEBUG) return;
    console.log('[edatime]', ...args);
}

export function dbgGroup<T>(label: string, fn?: () => T): T | undefined {
    if (!DEBUG) return fn?.();
    console.groupCollapsed(`[edatime] ${label}`);
    try {
        return fn?.();
    } finally {
        console.groupEnd();
    }
}

if (DEBUG) {
    window.addEventListener('error', (e: ErrorEvent) => {
        console.error('[edatime] window.error', e?.message, e?.error);
    });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        console.error('[edatime] unhandledrejection', e?.reason);
    });
}
