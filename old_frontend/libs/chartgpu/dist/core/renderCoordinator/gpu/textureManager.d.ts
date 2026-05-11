/**
 * GPU texture management for the RenderCoordinator.
 *
 * Handles lazy allocation of render target textures and MSAA overlay management.
 * Uses a multi-pass rendering strategy:
 * 1. Main scene → 4x MSAA texture, resolved to single-sample mainResolveTexture
 * 2. Blit resolved main scene to MSAA overlay target + draw annotations (MSAA overlay pass)
 * 3. Draw UI overlays on resolved swapchain (single-sample)
 *
 * @module textureManager
 */
import type { PipelineCache } from '../../PipelineCache';
/**
 * MSAA sample count for the main scene render pass.
 * All series renderers (line, area, bar, scatter, etc.) and the grid
 * must create pipelines with this sample count.
 */
export declare const MAIN_SCENE_MSAA_SAMPLE_COUNT = 4;
/**
 * MSAA sample count for annotation overlay pass.
 * Higher values reduce aliasing but increase memory/performance cost.
 */
export declare const ANNOTATION_OVERLAY_MSAA_SAMPLE_COUNT = 4;
/**
 * Texture manager state exposed to the render coordinator.
 */
export interface TextureManagerState {
    readonly mainColorView: GPUTextureView | null;
    /** Single-sample resolve target for the MSAA main pass. Used by the overlay blit. */
    readonly mainResolveView: GPUTextureView | null;
    readonly overlayMsaaView: GPUTextureView | null;
    readonly overlayBlitBindGroup: GPUBindGroup | null;
    readonly overlayBlitPipeline: GPURenderPipeline;
    readonly msaaSampleCount: number;
    /** MSAA sample count for the main scene render pass. */
    readonly mainSceneMsaaSampleCount: number;
}
/**
 * Configuration for texture manager creation.
 */
export interface TextureManagerConfig {
    readonly device: GPUDevice;
    readonly targetFormat: GPUTextureFormat;
    readonly pipelineCache?: PipelineCache;
}
/**
 * Texture manager interface returned by factory function.
 */
export interface TextureManager {
    /**
     * Ensures textures are allocated for the given dimensions.
     * Reallocates if size or format changes.
     *
     * @param width - Canvas width in device pixels
     * @param height - Canvas height in device pixels
     */
    ensureTextures(width: number, height: number): void;
    /**
     * Gets current texture manager state for rendering.
     *
     * @returns Current state with texture views and bind groups
     */
    getState(): TextureManagerState;
    /**
     * Disposes all GPU resources.
     * Textures, views, and bind groups are destroyed.
     */
    dispose(): void;
}
/**
 * Creates a texture manager for render target allocation and management.
 *
 * The texture manager uses lazy allocation: textures are only created when
 * first requested via ensureTextures(), and are reallocated if dimensions
 * or format change.
 *
 * **Architecture:**
 * - Main color texture: 4x MSAA render target for main scene
 * - Main resolve texture: Single-sample resolve target (read by overlay blit)
 * - Overlay MSAA texture: Multi-sample render target for annotations
 * - Blit pipeline: Copies resolved main scene to MSAA target for overlay pass
 *
 * @param config - Configuration with device and target format
 * @returns Texture manager instance
 */
export declare function createTextureManager(config: TextureManagerConfig): TextureManager;
//# sourceMappingURL=textureManager.d.ts.map