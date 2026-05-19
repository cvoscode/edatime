import type { CartesianSeriesData } from '../config/types';
export interface DataStore {
    setSeries(index: number, data: CartesianSeriesData, options?: Readonly<{
        xOffset?: number;
    }>): void;
    /**
     * Appends new points to an existing series without re-uploading the entire buffer when possible.
     *
     * - Reuses the same geometric growth policy as `setSeries`.
     * - When no reallocation is needed, writes only the appended byte range via `queue.writeBuffer(...)`.
     * - Maintains `pointCount` for render path queries.
     *
     * Throws if the series has not been set yet.
     */
    appendSeries(index: number, newPoints: CartesianSeriesData): void;
    removeSeries(index: number): void;
    getSeriesBuffer(index: number): GPUBuffer;
    /**
     * Returns the number of points last set for the given series index.
     *
     * Throws if the series has not been set yet.
     */
    getSeriesPointCount(index: number): number;
    dispose(): void;
}
export declare function createDataStore(device: GPUDevice): DataStore;
//# sourceMappingURL=createDataStore.d.ts.map