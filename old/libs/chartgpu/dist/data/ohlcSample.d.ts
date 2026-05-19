import type { OHLCDataPoint } from '../config/types';
/**
 * Downsamples OHLC (candlestick) data to a target number of points using bucket aggregation.
 *
 * Each bucket aggregates candles preserving OHLC semantics:
 * - timestamp and open from the first candle in the bucket
 * - close from the last candle in the bucket
 * - high as the maximum of all highs in the bucket
 * - low as the minimum of all lows in the bucket
 *
 * @param data - Array of OHLC data points (tuples or objects)
 * @param targetPoints - Desired number of output points
 * @returns Downsampled array; same reference if no sampling needed
 *
 * Edge cases:
 * - If `data.length <= targetPoints` or `targetPoints < 2`, returns the original array (same reference)
 * - First and last candles are always preserved exactly (same element references)
 * - Output shape matches input shape (tuples → tuples, objects → objects)
 */
export declare function ohlcSample(data: ReadonlyArray<OHLCDataPoint>, targetPoints: number): ReadonlyArray<OHLCDataPoint>;
//# sourceMappingURL=ohlcSample.d.ts.map