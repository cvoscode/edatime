/**
 * WebGPU support detection and validation
 *
 * Provides utilities to check if WebGPU is available and usable in the current environment.
 * Results are memoized to avoid redundant checks.
 */
/**
 * Result of WebGPU support check
 */
export interface WebGPUSupportResult {
    /** Whether WebGPU is supported and available */
    readonly supported: boolean;
    /** Optional reason explaining why WebGPU is not supported */
    readonly reason?: string;
}
/**
 * Checks if WebGPU is supported and available in the current environment.
 *
 * This function performs comprehensive checks:
 * - SSR-safe: validates that window and navigator are available
 * - Checks for navigator.gpu API presence
 * - Attempts to request a WebGPU adapter to verify actual support
 * - First tries high-performance adapter to match GPUContext behavior
 * - Falls back to default adapter if high-performance fails
 *
 * The result is memoized for performance, so multiple calls return the same promise.
 *
 * @returns Promise resolving to support check result with optional reason
 *
 * @example
 * ```typescript
 * const { supported, reason } = await checkWebGPUSupport();
 * if (!supported) {
 *   console.error('WebGPU not available:', reason);
 * }
 * ```
 */
export declare function checkWebGPUSupport(): Promise<WebGPUSupportResult>;
//# sourceMappingURL=checkWebGPU.d.ts.map