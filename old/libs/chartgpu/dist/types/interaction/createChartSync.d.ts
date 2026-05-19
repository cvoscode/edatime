import type { ChartGPU } from '../ChartGPU';
export type DisconnectCharts = () => void;
/**
 * Connects multiple charts so pointer movement in one chart drives crosshair/tooltip x
 * in the other charts (domain x sync). Returns a `disconnect()` function.
 *
 * Notes:
 * - Syncs interaction only (crosshair + tooltip x), not zoom/options.
 * - Uses a per-connection loop guard to prevent feedback.
 */
export declare function connectCharts(charts: ChartGPU[]): DisconnectCharts;
//# sourceMappingURL=createChartSync.d.ts.map