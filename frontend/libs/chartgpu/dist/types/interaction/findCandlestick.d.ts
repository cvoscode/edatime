import type { ResolvedCandlestickSeriesConfig } from '../config/OptionResolver';
import type { OHLCDataPoint } from '../config/types';
import type { LinearScale } from '../utils/scales';
export interface CandlestickMatch {
    seriesIndex: number;
    dataIndex: number;
    point: OHLCDataPoint;
}
/**
 * Computes the candlestick body width in xScale **range-space** units.
 *
 * Notes:
 * - This mirrors `createCandlestickRenderer.ts` bar width semantics, but stays in range units
 *   (CSS pixels in ChartGPU interaction usage).
 * - No DPR conversions are applied here.
 */
export declare function computeCandlestickBodyWidthRange(series: ResolvedCandlestickSeriesConfig, data: ReadonlyArray<OHLCDataPoint>, xScale: LinearScale, plotWidthFallback?: number): number;
/**
 * Finds the candlestick body under the given cursor position.
 *
 * Coordinate system contract:
 * - `x`/`y` MUST be in the same units as `xScale`/`yScale` **range-space**
 *   (ChartGPU interaction uses grid-local CSS pixels).
 *
 * Hit-test semantics:
 * - Body-only hit-testing (wicks ignored).
 * - A candle hits if:
 *   - `abs(x - xCenter) <= barWidth / 2`, AND
 *   - `y` is between the scaled `open` and `close` (inclusive).
 *
 * Performance:
 * - Per-series lower-bound binary search on timestamp, then scans left/right while x-distance alone can still hit.
 * - If timestamps are not monotonic non-decreasing finite numbers, falls back to an O(n) scan for correctness.
 *
 * Edge cases:
 * - Skips non-finite timestamps/open/close.
 * - If `barWidthClip` is non-finite or <= 0, returns null.
 * - Returns the closest in x (min abs dx) among hits; ties broken by smaller `dataIndex` (then smaller `seriesIndex`).
 */
export declare function findCandlestick(series: ReadonlyArray<ResolvedCandlestickSeriesConfig>, x: number, y: number, xScale: LinearScale, yScale: LinearScale, barWidthClip: number): CandlestickMatch | null;
//# sourceMappingURL=findCandlestick.d.ts.map