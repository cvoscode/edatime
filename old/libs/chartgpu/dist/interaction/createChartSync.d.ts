import type { ChartGPU } from '../ChartGPU';
export type DisconnectCharts = () => void;
export type ChartSyncOptions = Readonly<{
    /**
     * Sync crosshair + tooltip (interaction-x) across charts.
     *x
     * @default true
     */
    readonly syncCrosshair?: boolean;
    /**
     * Sync zoom/pan across charts (percent-space zoom range).
     *
     * @default false
     */
    readonly syncZoom?: boolean;
}>;
/**
 * Connects multiple charts so pointer movement in one chart drives crosshair/tooltip x
 * in the other charts (domain x sync). Returns a `disconnect()` function.
 *
 * Notes:
 * - By default, syncs interaction only (crosshair + tooltip x), not zoom/options.
 * - Enable zoom sync via `{ syncZoom: true }`.
 * - Uses a per-connection loop guard to prevent feedback.
 */
export declare function connectCharts(charts: ChartGPU[], options?: ChartSyncOptions): DisconnectCharts;
//# sourceMappingURL=createChartSync.d.ts.map