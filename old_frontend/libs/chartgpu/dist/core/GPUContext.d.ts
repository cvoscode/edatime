/**
 * GPUContext - WebGPU device and adapter management
 *
 * Handles WebGPU initialization, adapter selection, and device creation
 * following WebGPU best practices for resource management and error handling.
 *
 * This module provides both functional and class-based APIs for maximum flexibility.
 */
/** Canvas types supported by GPUContext. */
export type SupportedCanvas = HTMLCanvasElement;
/** Options for GPU context initialization. */
export interface GPUContextOptions {
    /** DPR for high-DPI displays. Auto-detects from `window.devicePixelRatio`, defaults to 1.0. */
    readonly devicePixelRatio?: number;
    /** Canvas alpha mode. Default: 'opaque' (faster, no transparency). */
    readonly alphaMode?: 'opaque' | 'premultiplied';
    /** GPU power preference for adapter selection. */
    readonly powerPreference?: 'low-power' | 'high-performance';
    /**
     * Optional WebGPU adapter. When both device and adapter are provided, initialization skips
     * requestAdapter/requestDevice and uses these objects (shared device mode). The caller owns
     * the device lifecycle; destroyGPUContext will not call device.destroy().
     */
    readonly adapter?: GPUAdapter;
    /**
     * Optional WebGPU device. When both device and adapter are provided, initialization skips
     * requestAdapter/requestDevice and uses these objects (shared device mode). The caller owns
     * the device lifecycle; destroyGPUContext will not call device.destroy().
     */
    readonly device?: GPUDevice;
}
/**
 * Represents the state of a GPU context.
 * All properties are readonly to ensure immutability.
 */
export interface GPUContextState {
    readonly adapter: GPUAdapter | null;
    readonly device: GPUDevice | null;
    readonly initialized: boolean;
    readonly canvas: HTMLCanvasElement | null;
    readonly canvasContext: GPUCanvasContext | null;
    readonly preferredFormat: GPUTextureFormat | null;
    readonly devicePixelRatio: number;
    readonly alphaMode: 'opaque' | 'premultiplied';
    readonly powerPreference: 'low-power' | 'high-performance';
}
/** Reliable type guard for DOM canvases (safe when DOM globals are absent). */
export declare function isHTMLCanvasElement(canvas: HTMLCanvasElement): canvas is HTMLCanvasElement;
/**
 * Creates a new GPUContext state with initial values.
 *
 * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
 * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
 * @returns A new GPUContextState instance
 */
export declare function createGPUContext(canvas?: HTMLCanvasElement, options?: GPUContextOptions): GPUContextState;
/**
 * Initializes the WebGPU context by requesting an adapter and device.
 * Returns a new state object with initialized values.
 *
 * @param context - The GPU context state to initialize
 * @returns A new GPUContextState with initialized adapter and device
 * @throws {Error} If WebGPU is not available in the browser
 * @throws {Error} If adapter request fails
 * @throws {Error} If device request fails
 * @throws {Error} If already initialized
 */
export declare function initializeGPUContext(context: GPUContextState): Promise<GPUContextState>;
/**
 * Gets the current texture from the canvas context.
 *
 * @param context - The GPU context state
 * @returns The current canvas texture
 * @throws {Error} If canvas is not configured or context is not initialized
 *
 * @example
 * ```typescript
 * const texture = getCanvasTexture(context);
 * // Use texture in render pass
 * ```
 */
export declare function getCanvasTexture(context: GPUContextState): GPUTexture;
/**
 * Clears the canvas to a solid color.
 * Creates a command encoder, begins a render pass with the specified clear color,
 * ends the pass, and submits it to the queue.
 *
 * @param context - The GPU context state
 * @param r - Red component (0.0 to 1.0)
 * @param g - Green component (0.0 to 1.0)
 * @param b - Blue component (0.0 to 1.0)
 * @param a - Alpha component (0.0 to 1.0)
 * @throws {Error} If canvas is not configured or context is not initialized
 * @throws {Error} If device is not available
 *
 * @example
 * ```typescript
 * // Clear to dark purple (#1a1a2e)
 * clearScreen(context, 0x1a / 255, 0x1a / 255, 0x2e / 255, 1.0);
 * ```
 */
export declare function clearScreen(context: GPUContextState, r: number, g: number, b: number, a: number): void;
/**
 * Destroys the WebGPU device and cleans up resources.
 *
 * AC-3 (CGPU-SHARED-DEVICE): Dispose semantics
 * - **Always** unconfigures the canvas context (releases textures from getCurrentTexture)
 * - **Conditionally** calls device.destroy():
 *   - Owned devices (created internally): destroyed
 *   - Shared devices (injected via options): NOT destroyed (caller owns lifecycle)
 *
 * AC-7 (CGPU-SHARED-DEVICE): Backwards compatibility
 * - Missing ownership metadata is treated as "owned" (preserves legacy behavior)
 *
 * Returns a new state object with reset values.
 * After calling this, the context must be reinitialized before use.
 *
 * @param context - The GPU context state to destroy
 * @returns A new GPUContextState with reset values
 */
export declare function destroyGPUContext(context: GPUContextState): GPUContextState;
/**
 * Convenience function that creates and initializes a GPU context in one step.
 *
 * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
 * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
 * @returns A fully initialized GPUContextState
 * @throws {Error} If initialization fails
 *
 * @example
 * ```typescript
 * const context = await createGPUContextAsync();
 * const device = context.device;
 * ```
 *
 * @example
 * ```typescript
 * const canvas = document.querySelector('canvas');
 * const context = await createGPUContextAsync(canvas);
 * const texture = getCanvasTexture(context);
 * ```
 */
export declare function createGPUContextAsync(canvas?: HTMLCanvasElement, options?: GPUContextOptions): Promise<GPUContextState>;
/**
 * GPUContext class wrapper for backward compatibility.
 *
 * This class provides a class-based API that internally uses the functional implementation.
 * Use the functional API directly for better type safety and immutability.
 */
export declare class GPUContext {
    private _state;
    /**
     * Gets the WebGPU adapter, or null if not initialized.
     */
    get adapter(): GPUAdapter | null;
    /**
     * Gets the WebGPU device, or null if not initialized.
     */
    get device(): GPUDevice | null;
    /**
     * Checks if the context has been initialized.
     */
    get initialized(): boolean;
    /**
     * Gets the canvas element, or null if not provided.
     */
    get canvas(): SupportedCanvas | null;
    /**
     * Gets the WebGPU canvas context, or null if canvas is not configured.
     */
    get canvasContext(): GPUCanvasContext | null;
    /**
     * Gets the preferred canvas format, or null if canvas is not configured.
     */
    get preferredFormat(): GPUTextureFormat | null;
    /**
     * Gets the device pixel ratio used for canvas sizing.
     */
    get devicePixelRatio(): number;
    /**
     * Gets the canvas alpha mode.
     */
    get alphaMode(): 'opaque' | 'premultiplied';
    /**
     * Gets the GPU power preference.
     */
    get powerPreference(): 'low-power' | 'high-performance';
    /**
     * Creates a new GPUContext instance.
     *
     * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
     * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
     */
    constructor(canvas?: HTMLCanvasElement, options?: GPUContextOptions);
    /**
     * Initializes the WebGPU context by requesting an adapter and device.
     *
     * @throws {Error} If WebGPU is not available in the browser
     * @throws {Error} If adapter request fails
     * @throws {Error} If device request fails
     * @throws {Error} If already initialized
     */
    initialize(): Promise<void>;
    /**
     * Static factory method to create and initialize a GPUContext instance.
     *
     * @param canvas - Optional canvas element (HTMLCanvasElement) to configure for WebGPU rendering
     * @param options - Optional configuration for device pixel ratio, alpha mode, and power preference
     * @returns A fully initialized GPUContext instance
     * @throws {Error} If initialization fails
     *
     * @example
     * ```typescript
     * const context = await GPUContext.create();
     * const device = context.device;
     * ```
     *
     * @example
     * ```typescript
     * const canvas = document.querySelector('canvas');
     * const context = await GPUContext.create(canvas);
     * const texture = context.getCanvasTexture();
     * ```
     */
    static create(canvas?: HTMLCanvasElement, options?: GPUContextOptions): Promise<GPUContext>;
    /**
     * Gets the current texture from the canvas context.
     *
     * @returns The current canvas texture
     * @throws {Error} If canvas is not configured or context is not initialized
     *
     * @example
     * ```typescript
     * const texture = context.getCanvasTexture();
     * // Use texture in render pass
     * ```
     */
    getCanvasTexture(): GPUTexture;
    /**
     * Clears the canvas to a solid color.
     * Creates a command encoder, begins a render pass with the specified clear color,
     * ends the pass, and submits it to the queue.
     *
     * @param r - Red component (0.0 to 1.0)
     * @param g - Green component (0.0 to 1.0)
     * @param b - Blue component (0.0 to 1.0)
     * @param a - Alpha component (0.0 to 1.0)
     * @throws {Error} If canvas is not configured or context is not initialized
     * @throws {Error} If device is not available
     *
     * @example
     * ```typescript
     * // Clear to dark purple (#1a1a2e)
     * context.clearScreen(0x1a / 255, 0x1a / 255, 0x2e / 255, 1.0);
     * ```
     */
    clearScreen(r: number, g: number, b: number, a: number): void;
    /**
     * Destroys the WebGPU device and cleans up resources.
     * After calling destroy(), the context must be reinitialized before use.
     */
    destroy(): void;
}
//# sourceMappingURL=GPUContext.d.ts.map