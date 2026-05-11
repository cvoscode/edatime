/**
 * Shared renderer utilities.
 *
 * Minimal, library-friendly helpers for common WebGPU boilerplate:
 * - shader module creation
 * - render pipeline creation (ergonomic config + sensible defaults)
 * - uniform buffer creation + updates
 *
 * Notes:
 * - All helpers are pure functions; they create resources but do not mutate external state.
 * - First argument is always `device: GPUDevice`.
 */
export type ShaderStageModuleSource = {
    /** Use an existing module. */
    readonly module: GPUShaderModule;
    readonly entryPoint?: string;
    readonly constants?: Record<string, GPUPipelineConstantValue>;
} | {
    /** Provide WGSL code to compile. */
    readonly code: string;
    readonly label?: string;
    readonly entryPoint?: string;
    readonly constants?: Record<string, GPUPipelineConstantValue>;
};
export type VertexStageConfig = ShaderStageModuleSource & {
    readonly buffers?: readonly GPUVertexBufferLayout[];
};
export type FragmentStageConfig = ShaderStageModuleSource & {
    /**
     * Provide full color target states directly (most flexible).
     * If omitted, `formats` must be provided.
     */
    readonly targets?: readonly GPUColorTargetState[];
    /**
     * Convenience: provide one or more target formats and optionally a shared blend/writeMask.
     * Ignored if `targets` is provided.
     */
    readonly formats?: GPUTextureFormat | readonly GPUTextureFormat[];
    readonly blend?: GPUBlendState;
    readonly writeMask?: GPUColorWriteFlags;
};
export type RenderPipelineConfig = (RenderPipelineConfigBase & {
    readonly fragment: FragmentStageConfig;
}) | (RenderPipelineConfigBase & {
    readonly fragment?: undefined;
});
export interface RenderPipelineConfigBase {
    readonly label?: string;
    /**
     * Defaults to `'auto'`.
     *
     * If you provide `bindGroupLayouts`, a pipeline layout will be created for you.
     * If both are provided, `layout` wins.
     */
    readonly layout?: GPUPipelineLayout | 'auto';
    readonly bindGroupLayouts?: readonly GPUBindGroupLayout[];
    readonly vertex: VertexStageConfig;
    readonly primitive?: GPUPrimitiveState;
    readonly depthStencil?: GPUDepthStencilState;
    readonly multisample?: GPUMultisampleState;
}
/**
 * Creates a shader module from WGSL source.
 */
export declare function createShaderModule(device: GPUDevice, code: string, label?: string): GPUShaderModule;
/**
 * Creates a render pipeline with reduced boilerplate and sensible defaults.
 *
 * Defaults:
 * - `layout: 'auto'`
 * - `vertex.entryPoint: 'vsMain'`
 * - `fragment.entryPoint: 'fsMain'` (if fragment present)
 * - `primitive.topology: 'triangle-list'`
 * - `multisample.count: 1`
 */
export declare function createRenderPipeline(device: GPUDevice, config: RenderPipelineConfig): GPURenderPipeline;
/**
 * Creates a uniform buffer suitable for `@group/@binding` uniform bindings.
 *
 * Notes:
 * - WebGPU's `queue.writeBuffer()` requires `byteLength` and offsets to be multiples of 4.
 * - Uniform data layout in WGSL is typically aligned to 16 bytes; we default to a 16-byte size alignment.
 * - If you plan to use this buffer with *dynamic offsets*, you must additionally align offsets to
 *   `device.limits.minUniformBufferOffsetAlignment` (commonly 256). This helper does not enforce that.
 */
export declare function createUniformBuffer(device: GPUDevice, size: number, options?: {
    readonly label?: string;
    readonly alignment?: number;
}): GPUBuffer;
/**
 * Writes CPU data into a uniform buffer (default offset 0).
 *
 * `data` must be a `BufferSource`:
 * - `ArrayBuffer` or `ArrayBufferView` (TypedArray/DataView)
 *
 * Important WebGPU constraint:
 * - `queue.writeBuffer()` requires write size (and offsets) to be multiples of 4 bytes.
 */
export declare function writeUniformBuffer(device: GPUDevice, buffer: GPUBuffer, data: BufferSource): void;
//# sourceMappingURL=rendererUtils.d.ts.map