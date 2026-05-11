import type { ResolvedPieSeriesConfig } from '../config/OptionResolver';
export type PieSliceMatch = Readonly<{
    seriesIndex: number;
    dataIndex: number;
    slice: ResolvedPieSeriesConfig['data'][number];
}>;
export type PieHitTestConfig = Readonly<{
    seriesIndex: number;
    series: ResolvedPieSeriesConfig;
}>;
export type PieCenterCssPx = Readonly<{
    x: number;
    y: number;
}>;
export type PieRadiusCssPx = Readonly<{
    inner: number;
    outer: number;
}>;
/**
 * Finds the pie slice under a given pointer position.
 *
 * Coordinate contract:
 * - `x`/`y` are plot/grid-local CSS pixels (origin at plot top-left, +y down).
 * - `center` is plot-local CSS pixels.
 * - `radius` is CSS pixels (inner/outer). Points within the donut hole are not hoverable.
 *
 * Angle conventions:
 * - Uses +y up for polar angle (to match `pie.wgsl` atan2(p.y, p.x)).
 * - Wraps angles to [0, 2π).
 * - Matches `createPieRenderer.ts` start angle default (90°).
 *
 * Value conventions:
 * - Ignores non-finite and non-positive slice values (mirrors renderer).
 */
export declare function findPieSlice(x: number, y: number, pieConfig: PieHitTestConfig, center: PieCenterCssPx, radius: PieRadiusCssPx): PieSliceMatch | null;
//# sourceMappingURL=findPieSlice.d.ts.map