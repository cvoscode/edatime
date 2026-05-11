/**
 * Annotation Label Rendering Utilities
 *
 * Generates DOM-based annotation labels for cartesian charts.
 * Handles template rendering, coordinate transformations, and styling
 * for lineX, lineY, point, and text annotations.
 *
 * @module renderAnnotationLabels
 */
import type { ResolvedChartGPUOptions } from '../../../config/OptionResolver';
import type { LinearScale } from '../../../utils/scales';
import type { TextOverlay } from '../../../components/createTextOverlay';
export interface AnnotationLabelRenderContext {
    currentOptions: ResolvedChartGPUOptions;
    xScale: LinearScale;
    yScale: LinearScale;
    canvasCssWidthForAnnotations: number;
    canvasCssHeightForAnnotations: number;
    plotLeftCss: number;
    plotTopCss: number;
    plotWidthCss: number;
    plotHeightCss: number;
    canvas: HTMLCanvasElement;
}
/**
 * Renders annotation labels to the text overlay.
 *
 * Processes annotations and generates DOM labels with template support,
 * coordinate transformations, and background styling.
 *
 * @param annotationOverlay - Text overlay for rendering labels
 * @param overlayContainer - DOM container for overlay positioning
 * @param context - Rendering context with scales, options, and layout
 */
export declare function renderAnnotationLabels(annotationOverlay: TextOverlay | null, overlayContainer: HTMLElement | null, context: AnnotationLabelRenderContext): void;
//# sourceMappingURL=renderAnnotationLabels.d.ts.map