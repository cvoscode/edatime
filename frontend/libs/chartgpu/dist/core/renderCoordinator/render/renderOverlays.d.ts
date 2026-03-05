/**
 * Overlay Rendering Utilities
 *
 * Prepares and renders GPU-based chart overlays (grid, axes, crosshair, highlight).
 * These overlays are rendered on top of the main chart series.
 *
 * @module renderOverlays
 */
import type { ResolvedChartGPUOptions } from '../../../config/OptionResolver';
import type { LinearScale } from '../../../utils/scales';
import type { GridRenderer } from '../../../renderers/createGridRenderer';
import type { AxisRenderer } from '../../../renderers/createAxisRenderer';
import type { CrosshairRenderer } from '../../../renderers/createCrosshairRenderer';
import type { HighlightRenderer } from '../../../renderers/createHighlightRenderer';
import type { GridArea } from '../../../renderers/createGridRenderer';
export interface OverlayRenderers {
    gridRenderer: GridRenderer;
    xAxisRenderer: AxisRenderer;
    yAxisRenderer: AxisRenderer;
    crosshairRenderer: CrosshairRenderer;
    highlightRenderer: HighlightRenderer;
}
export interface OverlayPrepareContext {
    currentOptions: ResolvedChartGPUOptions;
    xScale: LinearScale;
    yScale: LinearScale;
    gridArea: GridArea;
    xTickCount: number;
    hasCartesianSeries: boolean;
    effectivePointer: {
        hasPointer: boolean;
        isInGrid: boolean;
        source: 'mouse' | 'sync';
        x: number;
        y: number;
        gridX: number;
        gridY: number;
    };
    interactionScales: {
        xScale: LinearScale;
        yScale: LinearScale;
    } | null;
    seriesForRender: ReadonlyArray<any>;
    withAlpha: (color: string, alpha: number) => string;
}
export interface OverlayRenderContext {
    mainPass: GPURenderPassEncoder;
    topOverlayPass: GPURenderPassEncoder;
    hasCartesianSeries: boolean;
}
/**
 * Prepares all overlay renderers with current frame data.
 *
 * This includes grid lines, axes, crosshair, and point highlights.
 *
 * @param renderers - Overlay renderer instances
 * @param context - Rendering context with scales, options, and pointer state
 */
export declare function prepareOverlays(renderers: OverlayRenderers, context: OverlayPrepareContext): void;
/**
 * Renders all overlay elements to the appropriate render passes.
 *
 * Grid is rendered in the main pass (background).
 * Highlight, axes, and crosshair are rendered in the top overlay pass (foreground).
 *
 * @param renderers - Overlay renderer instances
 * @param context - Render pass context
 */
export declare function renderOverlays(renderers: OverlayRenderers, context: OverlayRenderContext): void;
//# sourceMappingURL=renderOverlays.d.ts.map