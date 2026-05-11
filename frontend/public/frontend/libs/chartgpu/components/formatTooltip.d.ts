import type { TooltipParams } from '../../src/config/types';
/**
 * Default tooltip formatter for candlestick series in item mode.
 * Renders O/H/L/C values with colored arrow and percentage change.
 */
export declare function formatCandlestickTooltip(params: TooltipParams): string;
/**
 * Default tooltip formatter for item mode.
 * Returns a compact single-row HTML snippet: dot + series name + y value.
 * For candlestick series, returns O/H/L/C with arrow and percentage change.
 */
export declare function formatTooltipItem(params: TooltipParams): string;
/**
 * Default tooltip formatter for axis mode.
 * Renders an x header line then one row per series with the y value.
 * Candlestick series show O/H/L/C values with arrow and percentage change.
 */
export declare function formatTooltipAxis(params: TooltipParams[]): string;
//# sourceMappingURL=formatTooltip.d.ts.map