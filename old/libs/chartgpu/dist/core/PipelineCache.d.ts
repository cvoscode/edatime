/**
 * CGPU-PIPELINE-CACHE
 *
 * Dedupes immutable WebGPU objects across charts:
 * - GPUShaderModule (keyed by WGSL source)
 * - GPURenderPipeline (keyed by identity-defining pipeline state)
 *
 * Notes:
 * - Cache is bound to a single GPUDevice.
 * - Cache auto-clears on device loss (`device.lost`) and resets stats.
 * - This cache does NOT store per-chart buffers/uniforms/bind groups.
 */
export type PipelineCacheStats = Readonly<{
    readonly shaderModules: Readonly<{
        readonly total: number;
        readonly hits: number;
        readonly misses: number;
        readonly entries: number;
    }>;
    readonly renderPipelines: Readonly<{
        readonly total: number;
        readonly hits: number;
        readonly misses: number;
        readonly entries: number;
    }>;
    readonly computePipelines: Readonly<{
        readonly total: number;
        readonly hits: number;
        readonly misses: number;
        readonly entries: number;
    }>;
}>;
export interface PipelineCache {
    readonly device: GPUDevice;
    /**
     * Returns an immutable snapshot of totals/hits/misses.
     */
    getStats(): PipelineCacheStats;
    /**
     * Clears all cached entries and resets stats.
     * Automatically invoked on `device.lost`.
     */
    clear(): void;
    /**
     * Shader module dedupe keyed by WGSL source string.
     */
    getOrCreateShaderModule(code: string, label?: string): GPUShaderModule;
    /**
     * Render pipeline dedupe keyed by identity-defining fields.
     */
    getOrCreateRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
    /**
     * Compute pipeline dedupe keyed by identity-defining fields.
     */
    getOrCreateComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
}
export declare function createPipelineCache(device: GPUDevice): PipelineCache;
//# sourceMappingURL=PipelineCache.d.ts.map