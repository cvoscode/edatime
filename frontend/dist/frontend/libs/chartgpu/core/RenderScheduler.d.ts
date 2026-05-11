/**
 * RenderScheduler - 60fps render loop management
 *
 * Manages a requestAnimationFrame-based render loop that runs at 60fps,
 * providing delta time tracking and frame scheduling control.
 *
 * This module provides both functional and class-based APIs for maximum flexibility.
 * The functional API is preferred for better type safety and immutability.
 */
/**
 * Callback function type for render frames.
 * Receives delta time in milliseconds since the last frame.
 */
export type RenderCallback = (deltaTime: number) => void;
import type { ExactFPS, Milliseconds, FrameTimeStats, FrameDropStats } from '../config/types';
/**
 * Represents the state of a render scheduler.
 * All properties are readonly to ensure immutability.
 */
export interface RenderSchedulerState {
    readonly id: symbol;
    readonly running: boolean;
}
/**
 * Creates a new RenderScheduler state with initial values.
 *
 * @returns A new RenderSchedulerState instance
 */
export declare function createRenderScheduler(): RenderSchedulerState;
/**
 * Starts the render loop.
 *
 * Begins a requestAnimationFrame loop that calls the provided callback
 * every frame with the delta time in milliseconds since the last frame.
 * Returns a new state object with running set to true.
 *
 * @param state - The scheduler state to start
 * @param callback - Function to call each frame with delta time
 * @returns A new RenderSchedulerState with running set to true
 * @throws {Error} If callback is not provided
 * @throws {Error} If scheduler is already running
 * @throws {Error} If state is invalid
 */
export declare function startRenderScheduler(state: RenderSchedulerState, callback: RenderCallback): RenderSchedulerState;
/**
 * Stops the render loop.
 *
 * Cancels any pending requestAnimationFrame calls and stops the loop.
 * Returns a new state object with running set to false.
 * The scheduler can be restarted by calling startRenderScheduler() again.
 *
 * @param state - The scheduler state to stop
 * @returns A new RenderSchedulerState with running set to false
 * @throws {Error} If state is invalid
 */
export declare function stopRenderScheduler(state: RenderSchedulerState): RenderSchedulerState;
/**
 * Marks the current frame as dirty and schedules a render if idle.
 *
 * This function implements render-on-demand: it schedules a frame when the
 * scheduler is idle. Multiple calls coalesce into a single frame.
 *
 * @param state - The scheduler state
 * @throws {Error} If state is invalid
 */
export declare function requestRender(state: RenderSchedulerState): void;
/**
 * Calculates exact FPS from frame timestamp deltas.
 *
 * Uses the circular buffer of performance.now() timestamps to calculate
 * frame-perfect FPS. Algorithm:
 * 1. Sum all frame time deltas in the buffer
 * 2. Divide by (count - 1) to get average frame time
 * 3. Convert to FPS: 1000ms / avg_frame_time
 *
 * Returns 0 if insufficient data (< 2 frames).
 *
 * @param state - The scheduler state
 * @returns Exact FPS measurement
 */
export declare function getCurrentFPS(state: RenderSchedulerState): ExactFPS;
/**
 * Calculates frame time statistics from the circular buffer.
 *
 * Computes min, max, avg, and percentiles (p50, p95, p99) for frame times.
 * Returns zero stats if insufficient data.
 *
 * @param state - The scheduler state
 * @returns Frame time statistics
 */
export declare function getFrameStats(state: RenderSchedulerState): FrameTimeStats;
/**
 * Gets frame drop statistics for the scheduler.
 *
 * @param state - The scheduler state
 * @returns Frame drop statistics
 */
export declare function getFrameDropStats(state: RenderSchedulerState): FrameDropStats;
/**
 * Gets total frames rendered and elapsed time.
 *
 * @param state - The scheduler state
 * @returns Object with totalFrames and elapsedTime
 */
export declare function getTotalFrames(state: RenderSchedulerState): {
    totalFrames: number;
    elapsedTime: Milliseconds;
};
/**
 * Destroys the render scheduler and cleans up resources.
 * Stops the loop if running and removes internal state from the map.
 * Returns a new state object with reset values.
 * After calling this, the scheduler must be recreated before use.
 *
 * **Important:** Always call this function when done with a scheduler to prevent memory leaks.
 * The internal state map will retain entries until explicitly destroyed.
 *
 * @param state - The scheduler state to destroy
 * @returns A new RenderSchedulerState with reset values
 */
export declare function destroyRenderScheduler(state: RenderSchedulerState): RenderSchedulerState;
/**
 * Convenience function that creates a scheduler and starts it in one step.
 *
 * @param callback - Function to call each frame with delta time
 * @returns A RenderSchedulerState with the loop running
 * @throws {Error} If callback is not provided
 *
 * @example
 * ```typescript
 * const scheduler = createRenderSchedulerAsync((deltaTime) => {
 *   renderFrame(deltaTime);
 * });
 * ```
 */
export declare function createRenderSchedulerAsync(callback: RenderCallback): RenderSchedulerState;
/**
 * RenderScheduler class wrapper for backward compatibility.
 *
 * This class provides a class-based API that internally uses the functional implementation.
 * Use the functional API directly for better type safety and immutability.
 */
export declare class RenderScheduler {
    private _state;
    /**
     * Checks if the scheduler is currently running.
     */
    get running(): boolean;
    /**
     * Creates a new RenderScheduler instance.
     */
    constructor();
    /**
     * Starts the render loop.
     *
     * @param callback - Function to call each frame with delta time
     * @throws {Error} If callback is not provided or scheduler already running
     */
    start(callback: RenderCallback): void;
    /**
     * Stops the render loop.
     */
    stop(): void;
    /**
     * Marks the current frame as dirty, indicating it needs to be rendered.
     */
    requestRender(): void;
    /**
     * Destroys the render scheduler and cleans up resources.
     * After calling destroy(), the scheduler must be recreated before use.
     */
    destroy(): void;
}
//# sourceMappingURL=RenderScheduler.d.ts.map