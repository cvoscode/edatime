import type { CartesianSeriesData, SeriesSampling } from '../config/types';
/**
 * Samples CartesianSeriesData using the specified sampling strategy.
 *
 * Returns the ORIGINAL data reference when:
 * - `sampling === 'none'`
 * - `samplingThreshold` is invalid/non-positive
 * - Point count <= threshold
 *
 * When sampling occurs:
 * - For `lttb`:
 *   - Float32Array interleaved → returns sampled Float32Array
 *   - Other interleaved typed array → packs to Float32Array, returns sampled Float32Array
 *   - DataPoint[] → returns sampled DataPoint[]
 *   - XYArraysData → packs to Float32Array, returns sampled Float32Array
 * - For `average`/`max`/`min`:
 *   - Returns DataPointTuple[] for all input formats
 */
export declare function sampleSeriesDataPoints(data: CartesianSeriesData, sampling: SeriesSampling, samplingThreshold: number): CartesianSeriesData;
//# sourceMappingURL=sampleSeries.d.ts.map