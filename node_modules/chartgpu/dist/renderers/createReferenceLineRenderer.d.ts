import type { GridArea } from './createGridRenderer';
import type { PipelineCache } from '../core/PipelineCache';
export type ReferenceLineAxis = 'vertical' | 'horizontal';
export interface ReferenceLineInstance {
    /**
     * Axis alignment.
     * - `'vertical'`: a line spanning the plot height at a fixed X position
     * - `'horizontal'`: a line spanning the plot width at a fixed Y position
     */
    readonly axis: ReferenceLineAxis;
    /**
     * Position in **CANVAS-LOCAL CSS pixels**.
     *
     * This is the same coordinate space as pointer event payloads:
     * - For vertical lines: canvas-local X in CSS px
     * - For horizontal lines: canvas-local Y in CSS px
     *
     * The shader converts CSS px → device px using DPR and relies on analytic AA for stable
     * strokes during zoom (no integer device-pixel snapping).
     */
    readonly positionCssPx: number;
    /**
     * Desired line width in **CSS pixels**.
     *
     * The renderer emulates thickness using a quad (two triangles) and converts CSS px to
     * device px using `gridArea.devicePixelRatio`.
     */
    readonly lineWidth: number;
    /**
     * Dash pattern in **CSS pixels**, matching the semantics of Canvas2D/SVG:
     * `[dash, gap, dash, gap, ...]`, repeating, starting with an "on" dash.
     *
     * - `undefined` / `[]` renders a solid line.
     * - Non-finite / non-positive entries are ignored.
     * - If the list length is odd, it is duplicated (CSS behavior) before truncation.
     * - The pattern is truncated to `MAX_DASH_VALUES`.
     */
    readonly lineDash?: ReadonlyArray<number>;
    /**
     * Line color as RGBA in 0..1.
     *
     * `rgba[3]` is the final opacity (i.e. you can pre-multiply any "opacity" control into alpha).
     */
    readonly rgba: readonly [number, number, number, number];
}
export interface ReferenceLineRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
    /**
     * Multisample count for the render pipeline.
     *
     * Must match the render pass color attachment sampleCount.
     * Defaults to 1 (no MSAA).
     */
    readonly sampleCount?: number;
    /**
     * Optional shared cache for shader modules + render pipelines.
     */
    readonly pipelineCache?: PipelineCache;
}
export interface ReferenceLineRenderer {
    /**
     * Prepares GPU buffers and uniforms for drawing.
     *
     * Coordinate contract:
     * - Line positions are CANVAS-LOCAL CSS pixels.
     * - `gridArea` margins are CSS pixels; `gridArea.canvasWidth/Height` are device pixels.
     */
    prepare(gridArea: GridArea, lines: ReadonlyArray<ReferenceLineInstance>): void;
    /**
     * Draws all prepared reference lines.
     *
     * Important: This renderer does NOT set scissor state. The render coordinator is expected
     * to set a scissor rect for the plot area before calling `render()`.
     */
    render(passEncoder: GPURenderPassEncoder, firstInstance?: number, instanceCount?: number): void;
    /** Cleans up GPU resources (best-effort). */
    dispose(): void;
}
export declare function createReferenceLineRenderer(device: GPUDevice, options?: ReferenceLineRendererOptions): ReferenceLineRenderer;
//# sourceMappingURL=createReferenceLineRenderer.d.ts.map