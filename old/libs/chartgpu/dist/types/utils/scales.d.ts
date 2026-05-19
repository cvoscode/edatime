export interface LinearScale {
    /**
     * Sets the scale domain (data range). Returns self for chaining.
     */
    domain(min: number, max: number): LinearScale;
    /**
     * Sets the scale range (pixel range). Returns self for chaining.
     */
    range(min: number, max: number): LinearScale;
    /**
     * Maps a domain value to a range value.
     *
     * Notes:
     * - No clamping (will extrapolate outside the domain).
     * - If the domain span is 0 (min === max), returns the midpoint of the range.
     */
    scale(value: number): number;
    /**
     * Maps a range value (pixel) back to a domain value.
     *
     * Notes:
     * - No clamping (will extrapolate outside the range).
     * - If the domain span is 0 (min === max), returns domain min for any input.
     */
    invert(pixel: number): number;
}
export interface CategoryScale {
    /**
     * Sets the category domain (ordered list of unique category names).
     * Returns self for chaining.
     *
     * Throws if duplicates exist (ambiguous mapping).
     */
    domain(categories: string[]): CategoryScale;
    /**
     * Sets the scale range (pixel range). Returns self for chaining.
     */
    range(min: number, max: number): CategoryScale;
    /**
     * Returns the center x-position for a category.
     *
     * Edge cases:
     * - Unknown category: returns NaN
     * - Empty domain: returns midpoint of range
     */
    scale(category: string): number;
    /**
     * Width allocated per category (always non-negative).
     *
     * Edge cases:
     * - Empty domain: returns 0
     * - Reversed ranges allowed
     */
    bandwidth(): number;
    /**
     * Returns the index of a category in the current domain.
     *
     * Edge cases:
     * - Unknown category: returns -1
     */
    categoryIndex(category: string): number;
}
/**
 * Creates a linear scale for mapping a numeric domain to a numeric range.
 *
 * Defaults to an identity mapping:
 * domain [0, 1] -> range [0, 1]
 */
export declare function createLinearScale(): LinearScale;
/**
 * Creates a category scale for mapping string categories to evenly spaced
 * x-positions across a numeric range.
 *
 * Defaults:
 * - domain: []
 * - range: [0, 1]
 */
export declare function createCategoryScale(): CategoryScale;
//# sourceMappingURL=scales.d.ts.map