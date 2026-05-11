/**
 * Internal cartesian data abstraction for CartesianSeriesData.
 *
 * Provides high-performance, allocation-minimizing primitives to support all three cartesian formats:
 * - ReadonlyArray<DataPoint> (tuple or object)
 * - XYArraysData (separate x/y/size arrays)
 * - InterleavedXYData (typed array view with [x0,y0,x1,y1,...] layout)
 *
 * DO NOT export from public entrypoint (src/index.ts). This is internal-only.
 *
 * @module cartesianData
 * @internal
 */
import type { CartesianSeriesData, DataPoint } from '../config/types';
/**
 * Bounds type for min/max x and y values.
 */
export type Bounds = Readonly<{
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}>;
/**
 * Returns the number of points in the CartesianSeriesData.
 */
export declare function getPointCount(data: CartesianSeriesData): number;
/**
 * Returns the x-coordinate of the point at index i.
 * Returns NaN if the point is undefined, null, or non-object (for DataPoint[] format).
 * This allows callers using `Number.isFinite()` to naturally skip missing points.
 */
export declare function getX(data: CartesianSeriesData, i: number): number;
/**
 * Returns the y-coordinate of the point at index i.
 * Returns NaN if the point is undefined, null, or non-object (for DataPoint[] format).
 * This allows callers using `Number.isFinite()` to naturally skip missing points.
 */
export declare function getY(data: CartesianSeriesData, i: number): number;
/**
 * Returns the size value of the point at index i, or undefined if not available.
 * Returns undefined if the point is undefined, null, or non-object (for DataPoint[] format).
 * Note: InterleavedXYData does NOT support interleaved size (use XYArraysData.size if needed).
 */
export declare function getSize(data: CartesianSeriesData, i: number): number | undefined;
/**
 * Packs XY coordinates from CartesianSeriesData into a Float32Array in interleaved layout.
 *
 * Writes `pointCount` points starting at `srcPointOffset` in the source data
 * into `out` starting at `outFloatOffset` (measured in float32 elements, not bytes).
 *
 * Each point writes 2 floats: [x - xOffset, y].
 * Size dimension is NOT packed (use getSize() separately if needed).
 *
 * @param out - Target Float32Array to write into
 * @param outFloatOffset - Starting offset in `out` (in float32 elements)
 * @param src - Source CartesianSeriesData
 * @param srcPointOffset - Starting point index in source
 * @param pointCount - Number of points to pack
 * @param xOffset - Value to subtract from x coordinates (for Float32 precision preservation)
 */
export declare function packXYInto(out: Float32Array, outFloatOffset: number, src: CartesianSeriesData, srcPointOffset: number, pointCount: number, xOffset: number): void;
/**
 * Computes xMin/xMax/yMin/yMax bounds from CartesianSeriesData.
 * Skips non-finite x or y values. Returns null if no finite points found.
 * Ensures xMin !== xMax and yMin !== yMax for scale derivation (expands max by +1 if needed).
 *
 * @param data - CartesianSeriesData in any supported format
 * @returns Bounds object or null if no finite points
 */
export declare function computeRawBoundsFromCartesianData(data: CartesianSeriesData): Bounds | null;
/**
 * Returns true if a CartesianSeriesData array contains any null entries (gap markers).
 * Only applies to ReadonlyArray<DataPoint | null> format — XYArraysData and
 * InterleavedXYData cannot contain null entries and always return false.
 */
export declare function hasNullGaps(data: CartesianSeriesData): boolean;
/**
 * Removes null entries from a DataPoint array.
 * Used by connectNulls to strip gap markers before GPU upload,
 * so the line/area draws through gaps instead of breaking.
 */
export declare function filterNullGaps(data: ReadonlyArray<DataPoint | null>): ReadonlyArray<DataPoint>;
/**
 * Removes gap entries (null or NaN) from any CartesianSeriesData format.
 *
 * Null entries in DataPoint[] arrays are a direct gap marker. NaN x/y values
 * in XYArraysData and InterleavedXYData arise when cartesianDataToMutableColumns
 * converts null DataPoint entries into NaN pairs for the columnar format.
 *
 * Used by connectNulls to strip all gap markers regardless of data format,
 * so the line/area draws through gaps instead of breaking.
 *
 * Returns a DataPointTuple[] with only finite-coordinate points.
 */
export declare function filterGaps(data: CartesianSeriesData): ReadonlyArray<DataPoint>;
//# sourceMappingURL=cartesianData.d.ts.map