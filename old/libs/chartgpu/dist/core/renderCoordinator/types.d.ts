/**
 * Shared types for the RenderCoordinator modules.
 *
 * @module types
 */
/**
 * Minimal GPUContext interface required by RenderCoordinator utilities.
 * This interface allows the render coordinator to work with any object
 * that provides WebGPU context properties, not just the full GPUContext class.
 */
export interface GPUContextLike {
    readonly device: GPUDevice | null;
    readonly canvas: HTMLCanvasElement | null;
    readonly canvasContext: GPUCanvasContext | null;
    readonly preferredFormat: GPUTextureFormat | null;
    readonly initialized: boolean;
    readonly devicePixelRatio?: number;
}
//# sourceMappingURL=types.d.ts.map