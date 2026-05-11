export type Rgba01 = readonly [r: number, g: number, b: number, a: number];
/**
 * Parse a CSS color string into RGBA floats in [0..1].
 *
 * Supported:
 * - #rgb / #rgba / #rrggbb / #rrggbbaa
 * - rgb(r,g,b)
 * - rgba(r,g,b,a)
 *
 * Returns null when parsing fails.
 */
export declare const parseCssColorToRgba01: (color: string) => Rgba01 | null;
export declare const parseCssColorToGPUColor: (color: string, fallback?: GPUColor) => GPUColor;
//# sourceMappingURL=colors.d.ts.map