/**
 * Shared axis label styling utilities.
 */
/**
 * Theme configuration for axis labels.
 */
export interface AxisLabelThemeConfig {
    readonly fontSize: number;
    readonly fontFamily: string;
    readonly textColor: string;
}
/**
 * Calculates the font size for axis titles (larger than regular tick labels).
 */
export declare function getAxisTitleFontSize(baseFontSize: number): number;
/**
 * Applies consistent styling to an axis label span element.
 */
export declare function styleAxisLabelSpan(span: HTMLSpanElement, isTitle: boolean, theme: AxisLabelThemeConfig): void;
//# sourceMappingURL=axisLabelStyling.d.ts.map