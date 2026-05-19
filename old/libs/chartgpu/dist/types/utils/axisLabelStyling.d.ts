/**
 * Shared axis label styling utilities.
 * Ensures consistent styling between main thread (DOM overlay) and worker thread rendering.
 */
import type { AxisLabel } from '../config/types.js';
import type { TextOverlay } from '../components/createTextOverlay.js';
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
export declare function styleAxisLabelSpan(span: HTMLSpanElement, label: AxisLabel, theme: AxisLabelThemeConfig): void;
/**
 * Adds axis labels to a text overlay with consistent styling.
 */
export declare function addAxisLabelsToOverlay(overlay: TextOverlay, xLabels: readonly AxisLabel[], yLabels: readonly AxisLabel[], theme: AxisLabelThemeConfig): void;
//# sourceMappingURL=axisLabelStyling.d.ts.map