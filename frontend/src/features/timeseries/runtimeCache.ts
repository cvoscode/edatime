import type { DataObject, FetchedWindow } from '../../types/api.js';
import type { YMode } from '../../types/chart.js';

/** Per-Timeseries-instance volatile data and request state. */
export interface TimeseriesRuntimeCache {
    data: DataObject | null;
    fetchedWindow: FetchedWindow | null;
    pendingYMode: YMode | null;
    pendingRestoreY: { min: number; max: number } | null;
    refetchOnZoom: boolean;
    clearScheduledFetch(): void;
    scheduleFetch(callback: () => void, delayMs: number): void;
    dispose(): void;
}

export function createTimeseriesRuntimeCache(): TimeseriesRuntimeCache {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cache: TimeseriesRuntimeCache = {
        data: null,
        fetchedWindow: null,
        pendingYMode: 'fit',
        pendingRestoreY: null,
        refetchOnZoom: true,
        clearScheduledFetch() {
            if (timer) clearTimeout(timer);
            timer = null;
        },
        scheduleFetch(callback, delayMs) {
            cache.clearScheduledFetch();
            timer = setTimeout(() => {
                timer = null;
                callback();
            }, delayMs);
        },
        dispose() {
            cache.clearScheduledFetch();
            cache.data = null;
            cache.fetchedWindow = null;
            cache.pendingYMode = null;
            cache.pendingRestoreY = null;
        },
    };
    return cache;
}
