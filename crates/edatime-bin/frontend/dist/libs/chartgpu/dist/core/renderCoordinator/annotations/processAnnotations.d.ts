/**
 * Annotation processing for the RenderCoordinator.
 *
 * Processes annotation configurations into GPU-renderable instances (reference lines,
 * markers) and DOM label data. Supports layering (above/below series) and multiple
 * annotation types (lineX, lineY, point, text).
 *
 * @module processAnnotations
 */
import type { AnnotationConfig } from '../../../config/types';
import type { LinearScale } from '../../../utils/scales';
import type { ThemeConfig } from '../../../themes/types';
import type { ReferenceLineInstance } from '../../../renderers/createReferenceLineRenderer';
import type { AnnotationMarkerInstance } from '../../../renderers/createAnnotationMarkerRenderer';
/**
 * Internal type for annotation label data (DOM overlay).
 */
export interface AnnotationLabelData {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly anchor?: 'start' | 'middle' | 'end';
    readonly color?: string;
    readonly fontSize?: number;
    readonly background?: Readonly<{
        readonly backgroundColor: string;
        readonly padding?: readonly [number, number, number, number];
        readonly borderRadius?: number;
    }>;
}
/**
 * Plot bounds in CSS pixels.
 */
export interface PlotBounds {
    readonly leftCss: number;
    readonly rightCss: number;
    readonly topCss: number;
    readonly bottomCss: number;
    readonly widthCss: number;
    readonly heightCss: number;
}
/**
 * Context for annotation processing.
 */
export interface AnnotationContext {
    readonly annotations: ReadonlyArray<AnnotationConfig>;
    readonly xScale: LinearScale;
    readonly yScale: LinearScale;
    readonly plotBounds: PlotBounds;
    readonly canvasCssWidth: number;
    readonly canvasCssHeight: number;
    readonly theme: ThemeConfig;
    readonly offsetX?: number;
    readonly offsetY?: number;
}
/**
 * Result of annotation processing.
 */
export interface AnnotationResult {
    readonly linesBelow: ReferenceLineInstance[];
    readonly linesAbove: ReferenceLineInstance[];
    readonly markersBelow: AnnotationMarkerInstance[];
    readonly markersAbove: AnnotationMarkerInstance[];
    readonly labels: AnnotationLabelData[];
}
/**
 * Processes annotations into GPU-renderable instances and DOM labels.
 *
 * **Annotation Types:**
 * - `lineX`: Vertical reference line at x coordinate
 * - `lineY`: Horizontal reference line at y coordinate
 * - `point`: Marker at (x, y) coordinate
 * - `text`: Text annotation with flexible positioning
 *
 * **Layering:**
 * - `belowSeries`: Rendered before series (occluded by data)
 * - `aboveSeries`: Rendered after series (always visible, default)
 *
 * **Labels:**
 * - Optional text labels for all annotation types
 * - Template support with {x}, {y}, {value}, {name} placeholders
 * - Background styling with padding and border radius
 *
 * @param context - Annotation processing context
 * @returns Annotation result with lines, markers, and labels
 */
export declare function processAnnotations(context: AnnotationContext): AnnotationResult;
//# sourceMappingURL=processAnnotations.d.ts.map