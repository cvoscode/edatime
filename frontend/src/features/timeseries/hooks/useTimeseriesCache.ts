/**
 * useTimeseriesCache — reactive signal-based cache for timeseries data.
 *
 * Replaces the module-level TimeseriesCache singleton in dataFetch.ts with
 * a composable that stores xValues and series as SolidJS signals.
 *
 * The cache is cleared when the dataset revision changes (consumers should
 * call clearCache() from their effect when revision increments).
 *
 * Color-only updates can read from the cache without re-fetching Arrow data.
 */
import { createSignal } from 'solid-js';
import type { TimeseriesData } from '../domain/types';

export interface UseTimeseriesCacheResult {
    /** Current cached timeseries data (null if not yet populated) */
    cachedData: () => TimeseriesData | null;
    /** Update cache with new fetched data */
    setCachedData: (data: TimeseriesData) => void;
    /** Invalidate cache (clear xValues and series) */
    clearCache: () => void;
    /** Whether cache has any data */
    hasCache: () => boolean;
}

export function useTimeseriesCache(): UseTimeseriesCacheResult {
    const [cachedData, setCachedData] = createSignal<TimeseriesData | null>(null);

    const setData = (data: TimeseriesData) => {
        setCachedData(data);
    };

    const clear = () => {
        setCachedData(null);
    };

    return {
        cachedData,
        setCachedData: setData,
        clearCache: clear,
        hasCache: () => cachedData() !== null,
    };
}

// Module-level cache instance for non-composable consumers (e.g., dataFetch utils)
// This preserves the existing _cache interface for updateCachedColors etc.
let _moduleCache: ReturnType<typeof useTimeseriesCache> | null = null;

export function getModuleCache(): UseTimeseriesCacheResult {
    if (!_moduleCache) {
        _moduleCache = useTimeseriesCache();
    }
    return _moduleCache;
}

export function clearModuleCache(): void {
    _moduleCache?.clearCache();
    _moduleCache = null;
}