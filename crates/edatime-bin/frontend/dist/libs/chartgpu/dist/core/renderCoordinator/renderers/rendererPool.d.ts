/**
 * Renderer pool management for the RenderCoordinator.
 *
 * Manages dynamic arrays of chart renderers with lazy instantiation and proper disposal.
 * Each chart type (line, area, scatter, etc.) maintains a pool of renderer instances
 * that grows/shrinks based on the number of series.
 *
 * @module rendererPool
 */
import { createAreaRenderer } from '../../../renderers/createAreaRenderer';
import { createLineRenderer } from '../../../renderers/createLineRenderer';
import { createScatterRenderer } from '../../../renderers/createScatterRenderer';
import { createScatterDensityRenderer } from '../../../renderers/createScatterDensityRenderer';
import { createPieRenderer } from '../../../renderers/createPieRenderer';
import { createCandlestickRenderer } from '../../../renderers/createCandlestickRenderer';
import { createBarRenderer } from '../../../renderers/createBarRenderer';
import type { PipelineCache } from '../../PipelineCache';
/**
 * Configuration for renderer pool creation.
 */
export interface RendererPoolConfig {
    readonly device: GPUDevice;
    readonly targetFormat: GPUTextureFormat;
    readonly pipelineCache?: PipelineCache;
    /**
     * Multisample count for all renderer pipelines.
     *
     * Must match the render pass color attachment sampleCount.
     * Defaults to 1 (no MSAA).
     */
    readonly sampleCount?: number;
}
/**
 * Renderer pool state exposed to the render coordinator.
 */
export interface RendererPoolState {
    readonly areaRenderers: ReadonlyArray<ReturnType<typeof createAreaRenderer>>;
    readonly lineRenderers: ReadonlyArray<ReturnType<typeof createLineRenderer>>;
    readonly scatterRenderers: ReadonlyArray<ReturnType<typeof createScatterRenderer>>;
    readonly scatterDensityRenderers: ReadonlyArray<ReturnType<typeof createScatterDensityRenderer>>;
    readonly pieRenderers: ReadonlyArray<ReturnType<typeof createPieRenderer>>;
    readonly candlestickRenderers: ReadonlyArray<ReturnType<typeof createCandlestickRenderer>>;
    readonly barRenderer: ReturnType<typeof createBarRenderer>;
}
/**
 * Renderer pool interface returned by factory function.
 */
export interface RendererPool {
    /**
     * Ensures area renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of area renderers
     */
    ensureAreaRendererCount(count: number): void;
    /**
     * Ensures line renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of line renderers
     */
    ensureLineRendererCount(count: number): void;
    /**
     * Ensures scatter renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of scatter renderers
     */
    ensureScatterRendererCount(count: number): void;
    /**
     * Ensures scatter density renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of scatter density renderers
     */
    ensureScatterDensityRendererCount(count: number): void;
    /**
     * Ensures pie renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of pie renderers
     */
    ensurePieRendererCount(count: number): void;
    /**
     * Ensures candlestick renderer count matches the given count.
     * Grows or shrinks the pool as needed, disposing excess renderers.
     *
     * @param count - Desired number of candlestick renderers
     */
    ensureCandlestickRendererCount(count: number): void;
    /**
     * Gets current renderer pool state for rendering.
     * Returns readonly arrays to prevent external mutation.
     *
     * @returns Current state with all renderer arrays
     */
    getState(): RendererPoolState;
    /**
     * Disposes all renderers in the pool.
     * Clears all arrays and destroys GPU resources.
     */
    dispose(): void;
}
/**
 * Creates a renderer pool for dynamic renderer management.
 *
 * The renderer pool uses lazy instantiation: renderers are only created when
 * the pool grows, and are disposed when the pool shrinks. This allows the
 * render coordinator to efficiently handle varying numbers of series.
 *
 * **Architecture:**
 * - Each chart type has a dedicated renderer array
 * - Bar renderer is a singleton (not pooled)
 * - Renderers are disposed when removed from the pool
 * - Arrays are cleared to release references
 *
 * @param config - Configuration with device and target format
 * @returns Renderer pool instance
 */
export declare function createRendererPool(config: RendererPoolConfig): RendererPool;
//# sourceMappingURL=rendererPool.d.ts.map