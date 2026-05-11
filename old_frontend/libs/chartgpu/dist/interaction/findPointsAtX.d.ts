import type { DataPoint } from '../config/types';
import type { ResolvedSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';
export type PointsAtXMatch = Readonly<{
    seriesIndex: number;
    dataIndex: number;
    point: DataPoint;
}>;
/**
 * Finds (at most) one nearest point per series at a given x position.
 *
 * Coordinate system contract (mirrors `findNearestPoint`):
 * - `xValue` and optional `tolerance` MUST be in the same units as `xScale` **range**.
 *   (Example: if your `xScale.range()` is in grid-local CSS pixels, pass `payload.gridX` from `createEventManager`.)
 *   Note: ChartGPU's internal renderer scales are currently in clip space (NDC, typically \[-1, 1\]); in that case
 *   convert your pointer x into clip space before calling this helper.
 *
 * Behavior:
 * - Assumes each series is sorted by increasing x in domain space.
 * - Uses a lower-bound binary search in domain-x, then expands outward while x-distance alone can still improve.
 * - Skips points with non-finite domain x or non-finite scaled x. If a series contains any NaN x values, this helper
 *   falls back to an O(n) scan for correctness (NaN breaks total ordering for binary search).
 * - Stable tie-breaking: for equal distance, chooses the smaller `dataIndex`.
 *
 * If `tolerance` is provided, it is interpreted in **xScale range units**. Matches beyond tolerance are omitted.
 * If `tolerance` is omitted (or non-finite), the nearest point per series is returned when possible.
 *
 * Bar series special-case:
 * - Bars occupy x-intervals \([left, right)\) in **xScale range units** (grid-local CSS px for interaction scales),
 *   using the same shared layout math as the bar renderer (grouping + stacking slots).
 * - If `tolerance` is finite, a bar match is only returned when `xValue` falls inside the bar interval expanded by
 *   `tolerance` on both sides: \([left - tolerance, right + tolerance)\).
 * - If `tolerance` is omitted / non-finite, we first attempt an exact interval hit (no expansion) and otherwise fall
 *   back to the existing nearest-x behavior (so axis-trigger tooltips still work away from bars).
 */
export declare function findPointsAtX(series: ReadonlyArray<ResolvedSeriesConfig>, xValue: number, xScale: LinearScale, tolerance?: number): ReadonlyArray<PointsAtXMatch>;
//# sourceMappingURL=findPointsAtX.d.ts.map