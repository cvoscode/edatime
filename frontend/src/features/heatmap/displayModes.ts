export type HeatmapDiagonalMode = 'kde' | 'histogram';
export type HeatmapPairMode = 'density' | 'scatter';

export interface HeatmapDisplayModes {
    diagonal: HeatmapDiagonalMode;
    pairs: HeatmapPairMode;
}

const DIAGONAL_STORAGE_KEY = 'edatime_heatmap_diagonal_mode';
const PAIR_STORAGE_KEY = 'edatime_heatmap_pair_mode';

function readStoredValue(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function readHeatmapDisplayModes(): HeatmapDisplayModes {
    return {
        diagonal: readStoredValue(DIAGONAL_STORAGE_KEY) === 'histogram' ? 'histogram' : 'kde',
        pairs: readStoredValue(PAIR_STORAGE_KEY) === 'scatter' ? 'scatter' : 'density',
    };
}

export function writeHeatmapDiagonalMode(mode: HeatmapDiagonalMode): void {
    try {
        window.localStorage.setItem(DIAGONAL_STORAGE_KEY, mode);
    } catch {
        // The control remains usable for this page visit if storage is unavailable.
    }
}

export function writeHeatmapPairMode(mode: HeatmapPairMode): void {
    try {
        window.localStorage.setItem(PAIR_STORAGE_KEY, mode);
    } catch {
        // The control remains usable for this page visit if storage is unavailable.
    }
}
