/**
 * Data point packing utilities for zero-copy transfer to GPU/Workers.
 *
 * These functions convert high-level DataPoint/OHLCDataPoint arrays into interleaved
 * Float32Array buffers suitable for:
 * - Direct GPU buffer uploads via `queue.writeBuffer()`
 * - Zero-copy transfer to Web Workers via postMessage transferList
 *
 * @module packDataPoints
 */
import type { DataPoint, OHLCDataPoint } from '../config/types';
/**
 * Packs DataPoint array into an interleaved Float32Array for GPU/Worker transfer.
 *
 * **Format**: `[x0, y0, x1, y1, x2, y2, ...]` (2 floats per point = 8 bytes stride)
 *
 * **Use cases**:
 * - Direct upload to GPU vertex buffers via `queue.writeBuffer(buffer, 0, packed.buffer)`
 * - Zero-copy transfer to workers: `postMessage({ data: packed }, [packed.buffer])`
 *
 * **Performance**: The returned Float32Array's underlying ArrayBuffer is transferable,
 * enabling zero-copy postMessage operations. After transfer, the source Float32Array
 * becomes detached (length = 0).
 *
 * @param points - Array of data points (tuple or object form)
 * @returns Interleaved Float32Array [x0,y0,x1,y1,...]. The .buffer property is transferable.
 * @throws {TypeError} If points is null, undefined, or not an array
 * @throws {RangeError} If points array is empty or contains invalid values
 *
 * @example
 * ```typescript
 * const points = [{ x: 0, y: 10 }, { x: 1, y: 20 }];
 * const packed = packDataPoints(points);
 * // packed = Float32Array[0, 10, 1, 20]
 * // packed.buffer is transferable
 *
 * // Zero-copy transfer to worker:
 * worker.postMessage({ data: packed }, [packed.buffer]);
 * // After transfer, packed.length === 0 (detached)
 * ```
 */
export declare function packDataPoints(points: ReadonlyArray<DataPoint>): Float32Array;
/**
 * Packs OHLCDataPoint array into an interleaved Float32Array for GPU/Worker transfer.
 *
 * **Format**: `[t0, o0, h0, l0, c0, t1, o1, h1, l1, c1, ...]` (5 floats per point = 20 bytes stride)
 *
 * Order follows ECharts convention: timestamp, open, high, low, close (t, o, h, l, c).
 *
 * **Use cases**:
 * - Direct upload to GPU vertex buffers for candlestick rendering
 * - Zero-copy transfer to workers for streaming candlestick data
 *
 * **Performance**: The returned Float32Array's underlying ArrayBuffer is transferable,
 * enabling zero-copy postMessage operations. After transfer, the source Float32Array
 * becomes detached (length = 0).
 *
 * @param points - Array of OHLC data points (tuple or object form)
 * @returns Interleaved Float32Array [t0,o0,h0,l0,c0,t1,...]. The .buffer property is transferable.
 * @throws {TypeError} If points is null, undefined, or not an array
 * @throws {RangeError} If points array is empty or contains invalid values
 *
 * @example
 * ```typescript
 * const ohlcPoints = [
 *   { timestamp: 1000, open: 100, high: 110, low: 95, close: 105 },
 *   { timestamp: 2000, open: 105, high: 115, low: 100, close: 110 }
 * ];
 * const packed = packOHLCDataPoints(ohlcPoints);
 * // packed = Float32Array[1000, 100, 110, 95, 105, 2000, 105, 115, 100, 110]
 * // packed.buffer is transferable
 *
 * // Zero-copy transfer to worker:
 * worker.postMessage({ data: packed }, [packed.buffer]);
 * // After transfer, packed.length === 0 (detached)
 * ```
 */
export declare function packOHLCDataPoints(points: ReadonlyArray<OHLCDataPoint>): Float32Array;
//# sourceMappingURL=packDataPoints.d.ts.map