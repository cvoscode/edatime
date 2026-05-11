import type { DataPoint } from '../config/types';
export interface DataStore {
    setSeries(index: number, data: ReadonlyArray<DataPoint>): void;
    /**
     * Appends new points to an existing series without re-uploading the entire buffer when possible.
     *
     * - Reuses the same geometric growth policy as `setSeries`.
     * - When no reallocation is needed, writes only the appended byte range via `queue.writeBuffer(...)`.
     * - Maintains `pointCount` and a CPU-side combined data array so `getSeriesData(...)` remains correct.
     *
     * Throws if the series has not been set yet.
     */
    appendSeries(index: number, newPoints: ReadonlyArray<DataPoint>): void;
    removeSeries(index: number): void;
    getSeriesBuffer(index: number): GPUBuffer;
    /**
     * Returns the number of points last set for the given series index.
     *
     * Throws if the series has not been set yet.
     */
    getSeriesPointCount(index: number): number;
    /**
     * Returns the last CPU-side data set for the given series index.
     *
     * This is intended for internal metadata/hit-testing paths that need the same
     * input array that was packed into the GPU buffer (without re-threading it
     * through other state). Throws if the series has not been set yet.
     */
    getSeriesData(index: number): ReadonlyArray<DataPoint>;
    dispose(): void;
}
export declare function createDataStore(device: GPUDevice): DataStore;
//# sourceMappingURL=createDataStore.d.ts.map