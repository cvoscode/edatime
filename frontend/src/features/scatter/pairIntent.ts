import type { DatasetMetadata } from '../../types/api.js';

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

/** Notify the correlation matrix that the Pair plot axes changed. */
export function publishScatterPairSelection(x: string, y: string): void {
    const nextX = String(x || '').trim();
    const nextY = String(y || '').trim();
    if (!nextX || !nextY || nextX === nextY || typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('edatime:scatter-pair-changed', {
        detail: { x: nextX, y: nextY },
    }));
}

const SAVED_PAIR_KEY = 'edatime_pair_plot_axes';

function sourceIdentity(metadata: DatasetMetadata | null): { sourceVersionId: string; sourceRevision: number } | null {
    const sourceVersionId = metadata?.source_version_id;
    const sourceRevision = metadata?.source_version_revision ?? metadata?.revision;
    if (!sourceVersionId || !Number.isSafeInteger(sourceRevision)) return null;
    return { sourceVersionId, sourceRevision: sourceRevision! };
}

/** Restore only axes that still exist in this immutable dataset version. */
export function restoreSavedScatterPair(metadata: DatasetMetadata, numericColumns: string[]): ScatterPairIntent | null {
    const source = sourceIdentity(metadata);
    if (!source) return null;
    try {
        const saved = JSON.parse(sessionStorage.getItem(SAVED_PAIR_KEY) || 'null');
        if (!saved || saved.sourceVersionId !== source.sourceVersionId || saved.sourceRevision !== source.sourceRevision) return null;
        if (typeof saved.x !== 'string' || typeof saved.y !== 'string' || saved.x === saved.y) return null;
        return numericColumns.includes(saved.x) && numericColumns.includes(saved.y)
            ? { x: saved.x, y: saved.y }
            : null;
    } catch {
        return null;
    }
}

/** Remember the axes only once their result has rendered successfully. */
export function rememberScatterPair(metadata: DatasetMetadata | null, pair: ScatterPairIntent): void {
    const source = sourceIdentity(metadata);
    if (!source || !pair.x || !pair.y || pair.x === pair.y) return;
    try {
        sessionStorage.setItem(SAVED_PAIR_KEY, JSON.stringify({ ...source, ...pair }));
    } catch { /* The current plot remains usable when browser storage is unavailable. */ }
}
