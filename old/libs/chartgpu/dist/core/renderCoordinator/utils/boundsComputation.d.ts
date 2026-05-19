/**
 * Bounds computation utilities for the RenderCoordinator.
 *
 * These pure functions compute xMin/xMax/yMin/yMax bounds from data arrays
 * and aggregate bounds across series. They handle edge cases like empty data,
 * NaN/Infinity values, and zero-span domains.
 *
 * @module boundsComputation
 */
import type { DataPoint, OHLCDataPoint } from '../../../config/types';
import type { ResolvedChartGPUOptions } from '../../../config/OptionResolver';
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
 * Computes xMin/xMax/yMin/yMax bounds from cartesian data array.
 * Skips non-finite values. Returns null if no finite points found.
 * Ensures xMin !== xMax and yMin !== yMax for scale derivation.
 *
 * @param data - Array of data points (tuple or object format)
 * @returns Bounds object or null if no finite points
 */
export declare const computeRawBoundsFromData: (data: ReadonlyArray<DataPoint>) => Bounds | null;
/**
 * Extends existing bounds with new cartesian data points.
 * If bounds is null and points are valid, seeds bounds from points.
 *
 * @param bounds - Existing bounds or null
 * @param points - New points to extend bounds with
 * @returns Updated bounds or null if no finite points
 */
export declare const extendBoundsWithDataPoints: (bounds: Bounds | null, points: ReadonlyArray<DataPoint>) => Bounds | null;
/**
 * Extends bounds with OHLC candlestick data using low/high values.
 * If bounds is null, initializes bounds from OHLC points.
 *
 * @param bounds - Existing bounds or null
 * @param points - OHLC points (timestamp, open, high, low, close)
 * @returns Updated bounds or original bounds if no finite points
 */
export declare const extendBoundsWithOHLCDataPoints: (bounds: Bounds | null, points: ReadonlyArray<OHLCDataPoint>) => Bounds | null;
/**
 * Aggregates bounds across all series, handling pie/candlestick special cases.
 * Prefers precomputed rawBounds from OptionResolver when available to avoid O(n) scans.
 *
 * @param series - Resolved series configurations
 * @param runtimeRawBoundsByIndex - Optional runtime bounds (used for streaming appends)
 * @returns Global bounds across all series, defaults to (0,1) x (0,1) if no finite data
 */
export declare const computeGlobalBounds: (series: ResolvedChartGPUOptions["series"], runtimeRawBoundsByIndex?: ReadonlyArray<Bounds | null> | null) => Bounds;
/**
 * Ensures min ≤ max, handles infinities with defaults (0,1), handles zero-span domains.
 * Returns a usable domain for scale derivation.
 *
 * @param minCandidate - Candidate minimum value
 * @param maxCandidate - Candidate maximum value
 * @returns Normalized domain with min ≤ max, both finite
 */
export declare const normalizeDomain: (minCandidate: number, maxCandidate: number) => {
    readonly min: number;
    readonly max: number;
};
//# sourceMappingURL=boundsComputation.d.ts.map