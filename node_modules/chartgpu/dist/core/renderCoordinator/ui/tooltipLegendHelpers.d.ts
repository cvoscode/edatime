/**
 * Tooltip and legend helper utilities.
 *
 * Provides utilities for managing tooltip state, caching content to avoid
 * unnecessary DOM updates, and computing tooltip anchor positions for special
 * chart types like candlesticks.
 *
 * @module tooltipLegendHelpers
 */
import type { OHLCDataPoint } from '../../../config/types';
import type { LinearScale } from '../../../utils/scales';
/**
 * Tooltip anchor position in canvas-local CSS pixels.
 */
export interface TooltipAnchor {
    readonly x: number;
    readonly y: number;
}
/**
 * Cached tooltip state for content deduplication.
 *
 * Tracks the last displayed content and position to avoid unnecessary DOM updates
 * when the tooltip hasn't actually changed.
 */
export interface TooltipCache {
    content: string | null;
    x: number | null;
    y: number | null;
}
/**
 * Creates a new empty tooltip cache.
 *
 * @returns Fresh tooltip cache with null values
 */
export declare function createTooltipCache(): TooltipCache;
/**
 * Checks if tooltip content or position has changed.
 *
 * Returns true if any of the values differ from the cache, indicating that
 * a DOM update is needed.
 *
 * @param cache - Current cached state
 * @param content - New content to display
 * @param x - New X position in CSS pixels
 * @param y - New Y position in CSS pixels
 * @returns True if update is needed (values differ from cache)
 */
export declare function shouldUpdateTooltip(cache: TooltipCache, content: string, x: number, y: number): boolean;
/**
 * Updates the tooltip cache with new values.
 *
 * Should be called after successfully updating the DOM to keep cache in sync.
 *
 * @param cache - Tooltip cache to update (mutated)
 * @param content - New content that was displayed
 * @param x - New X position that was set
 * @param y - New Y position that was set
 */
export declare function updateTooltipCache(cache: TooltipCache, content: string, x: number, y: number): void;
/**
 * Clears the tooltip cache.
 *
 * Should be called when the tooltip is hidden to ensure fresh state
 * when it's shown again.
 *
 * @param cache - Tooltip cache to clear (mutated)
 */
export declare function clearTooltipCache(cache: TooltipCache): void;
/**
 * Computes container-local CSS pixel anchor coordinates for a candlestick tooltip.
 *
 * The anchor is positioned near the candle body center for stable tooltip positioning
 * even when the cursor is at the edge of the candlestick.
 *
 * Coordinate transformations:
 * 1. Extract O/H/L/C from data point (tuple: [timestamp, open, close, low, high])
 * 2. Compute body center Y = (open + close) / 2
 * 3. Transform to clip space via scales
 * 4. Convert clip space to canvas-local CSS pixels
 * 5. Add container offset for absolute positioning
 *
 * Returns null if any coordinate computation fails (non-finite values).
 *
 * @param point - OHLC data point (tuple or object format)
 * @param xScale - Linear scale for X axis
 * @param yScale - Linear scale for Y axis
 * @param canvasCssWidth - Canvas width in CSS pixels
 * @param canvasCssHeight - Canvas height in CSS pixels
 * @param offsetX - Container offset X in CSS pixels (default: 0)
 * @param offsetY - Container offset Y in CSS pixels (default: 0)
 * @returns Tooltip anchor position or null if computation fails
 */
export declare function computeCandlestickTooltipAnchor(point: OHLCDataPoint, xScale: LinearScale, yScale: LinearScale, canvasCssWidth: number, canvasCssHeight: number, offsetX?: number, offsetY?: number): TooltipAnchor | null;
/**
 * Determines if a data point is an OHLC/candlestick point.
 *
 * Checks if the point is a 5-element tuple (timestamp, open, close, low, high)
 * or an object with OHLC properties.
 *
 * @param point - Data point to check
 * @returns True if point is OHLC format
 */
export declare function isOHLCDataPoint(point: any): point is OHLCDataPoint;
//# sourceMappingURL=tooltipLegendHelpers.d.ts.map