/**
 * Axis tick computation and formatting.
 *
 * Generates tick values and formatting for linear axes. Handles decimal precision
 * determination based on tick step size and provides number formatting utilities.
 *
 * @module computeAxisTicks
 */
/**
 * Generates evenly-spaced tick values between domain min and max.
 *
 * @param domainMin - Minimum value of the domain
 * @param domainMax - Maximum value of the domain
 * @param tickCount - Number of ticks to generate (must be >= 1)
 * @returns Array of tick values
 */
export declare function generateLinearTicks(domainMin: number, domainMax: number, tickCount: number): number[];
/**
 * Computes the maximum number of decimal places needed to display a tick step cleanly.
 *
 * Prefers "clean" decimal representations (e.g., 2.5, 0.25, 0.125) without relying on
 * magnitude alone. Accepts floating-point noise and caps the search to keep formatting
 * reasonable.
 *
 * @param tickStep - The step size between ticks
 * @param cap - Maximum number of decimal places to consider (default: 8)
 * @returns Number of decimal places (0 to cap)
 */
export declare function computeMaxFractionDigitsFromStep(tickStep: number, cap?: number): number;
/**
 * Creates an Intl.NumberFormat for tick value formatting.
 *
 * Automatically determines the appropriate number of decimal places based on the
 * tick step size using `computeMaxFractionDigitsFromStep()`.
 *
 * @param tickStep - The step size between ticks
 * @returns Intl.NumberFormat configured for tick formatting
 */
export declare function createTickFormatter(tickStep: number): Intl.NumberFormat;
/**
 * Formats a numeric tick value using the provided number formatter.
 *
 * Handles edge cases:
 * - Non-finite values return null
 * - Values near zero (< 1e-12) are normalized to 0 to avoid "-0" display
 * - Unexpected "NaN" output from formatter is guarded against
 *
 * @param nf - Intl.NumberFormat to use for formatting
 * @param v - Numeric value to format
 * @returns Formatted string or null if value cannot be formatted
 */
export declare function formatTickValue(nf: Intl.NumberFormat, v: number): string | null;
//# sourceMappingURL=computeAxisTicks.d.ts.map