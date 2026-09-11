/**
 * One-shot navigation intent used when another analytics page opens a pair.
 * Keeping the pair together prevents lazy dropdown initialization from
 * observing an intermediate X/Y state.
 */
export interface ScatterPairIntent {
    x: string;
    y: string;
}

let pendingIntent: ScatterPairIntent | null = null;

export function requestScatterPair(x: string, y: string): void {
    const nextX = String(x || '').trim();
    const nextY = String(y || '').trim();
    if (!nextX || !nextY || nextX === nextY) return;
    pendingIntent = { x: nextX, y: nextY };
}

export function consumeScatterPairIntent(): ScatterPairIntent | null {
    const intent = pendingIntent;
    pendingIntent = null;
    return intent;
}

export function clearScatterPairIntent(): void {
    pendingIntent = null;
}

/** Notify the combined correlation view that the live Pair plot axes changed. */
export function publishScatterPairSelection(x: string, y: string): void {
    const nextX = String(x || '').trim();
    const nextY = String(y || '').trim();
    if (!nextX || !nextY || nextX === nextY || typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('edatime:scatter-pair-changed', {
        detail: { x: nextX, y: nextY },
    }));
}
