export interface GridRenderer {
    /**
     * Backward compatible:
     * - `prepare(gridArea, lineCount)` where `lineCount` is `{ horizontal?, vertical? }`
     *
     * Preferred:
     * - `prepare(gridArea, { lineCount, color })`
     */
    prepare(gridArea: GridArea, lineCountOrOptions?: GridLineCount | GridPrepareOptions): void;
    render(passEncoder: GPURenderPassEncoder): void;
    dispose(): void;
}
export interface GridArea {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly devicePixelRatio: number;
}
export interface GridLineCount {
    readonly horizontal?: number;
    readonly vertical?: number;
}
export interface GridPrepareOptions {
    readonly lineCount?: GridLineCount;
    /**
     * CSS color string used for grid lines.
     *
     * Expected formats: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r,g,b)`, `rgba(r,g,b,a)`.
     */
    readonly color?: string;
}
export interface GridRendererOptions {
    /**
     * Must match the canvas context format used for the render pass color attachment.
     * Usually this is `gpuContext.preferredFormat`.
     *
     * Defaults to `'bgra8unorm'` for backward compatibility.
     */
    readonly targetFormat?: GPUTextureFormat;
}
export declare function createGridRenderer(device: GPUDevice, options?: GridRendererOptions): GridRenderer;
//# sourceMappingURL=createGridRenderer.d.ts.map