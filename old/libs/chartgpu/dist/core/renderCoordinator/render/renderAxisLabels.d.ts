/**
 * Axis Label Rendering Utilities
 *
 * Generates DOM-based axis labels and titles for cartesian charts.
 * Labels are positioned using canvas-local CSS coordinates and rendered
 * into a text overlay element.
 *
 * @module renderAxisLabels
 */
import type { ResolvedChartGPUOptions } from '../../../config/OptionResolver';
import type { LinearScale } from '../../../utils/scales';
import type { TextOverlay } from '../../../components/createTextOverlay';
export interface AxisLabelRenderContext {
    gpuContext: {
        canvas: HTMLCanvasElement | null;
    };
    currentOptions: ResolvedChartGPUOptions;
    xScale: LinearScale;
    yScale: LinearScale;
    xTickValues: ReadonlyArray<number>;
    plotClipRect: {
        left: number;
        right: number;
        top: number;
        bottom: number;
    };
    visibleXRangeMs: number;
}
/**
 * Renders axis labels and titles to the text overlay.
 *
 * Generates X and Y axis tick labels with appropriate formatting,
 * and renders axis titles if configured.
 *
 * @param axisLabelOverlay - Text overlay for rendering labels
 * @param overlayContainer - DOM container for overlay positioning
 * @param context - Rendering context with scales, options, and layout
 */
export declare function renderAxisLabels(axisLabelOverlay: TextOverlay | null, overlayContainer: HTMLElement | null, context: AxisLabelRenderContext): void;
//# sourceMappingURL=renderAxisLabels.d.ts.map