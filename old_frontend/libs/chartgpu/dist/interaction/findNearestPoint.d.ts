import type { DataPoint } from '../config/types';
import type { ResolvedBarSeriesConfig, ResolvedSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
export type NearestPointMatch = Readonly<{
    seriesIndex: number;
    dataIndex: number;
    point: DataPoint;
    /** Euclidean distance in range units. */
    distance: number;
}>;
export type BarBounds = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};
export declare function isPointInBar(x: number, y: number, barBounds: BarBounds): boolean;
export type BarClusterSlots = Readonly<{
    clusterIndexBySeries: ReadonlyArray<number>;
    clusterCount: number;
    stackIdBySeries: ReadonlyArray<string>;
}>;
export declare function computeBarClusterSlots(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>): BarClusterSlots;
export declare function computeBarCategoryStep(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>): number;
export declare function computeCategoryWidthPx(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>, xScale: LinearScale, categoryStep: number): number;
export type BarLayoutPx = Readonly<{
    categoryStep: number;
    categoryWidthPx: number;
    barWidthPx: number;
    gapPx: number;
    clusterWidthPx: number;
    clusterSlots: BarClusterSlots;
}>;
export declare function computeBarLayoutPx(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>, xScale: LinearScale): BarLayoutPx;
export declare function inferPlotHeightPxForBarHitTesting(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>, yScale: LinearScale): number;
export declare function computeBaselineDomainAndPx(seriesConfigs: ReadonlyArray<ResolvedBarSeriesConfig>, yScale: LinearScale, plotHeightPx: number): Readonly<{
    baselineDomain: number;
    baselinePx: number;
}>;
export declare function bucketStackedXKey(xCenterPx: number, categoryWidthPx: number, xDomain: number, categoryStep: number): number;
/**
 * Finds the nearest data point to the given cursor position across all series.
 *
 * Coordinate system contract:
 * - `x`/`y` MUST be in the same units as `xScale`/`yScale` **range**.
 * - If you pass **grid-local CSS pixels** (e.g. `payload.gridX` / `payload.gridY` from `createEventManager`),
 *   then `xScale.range()` / `yScale.range()` must also be in **CSS pixels**.
 * - If your scales are in **clip space** (e.g. \([-1, 1]\)), pass cursor coordinates in clip space too.
 *
 * DPR/WebGPU note:
 * - Pointer events are naturally in CSS pixels; WebGPU rendering often uses device pixels or clip space.
 *   This helper stays agnostic and only computes Euclidean distance in the provided **range-space**.
 *
 * Performance notes:
 * - Assumes each series is sorted by increasing x in domain space.
 * - Uses per-series lower-bound binary search on x, then expands outward while x-distance alone can still win.
 * - Uses squared distance comparisons and computes `sqrt` only for the final match.
 * - Skips non-finite points and any points whose scaled coordinates are NaN.
 */
export declare function findNearestPoint(series: ReadonlyArray<ResolvedSeriesConfig>, x: number, y: number, xScale: LinearScale, yScale: LinearScale, maxDistance?: number): NearestPointMatch | null;
//# sourceMappingURL=findNearestPoint.d.ts.map