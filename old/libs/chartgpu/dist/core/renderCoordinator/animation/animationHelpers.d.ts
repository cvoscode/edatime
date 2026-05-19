/**
 * Animation helper utilities for intro and update animations.
 *
 * Provides pure functions for animation config resolution, easing transformations,
 * series interpolation, and animation state management. These utilities support
 * both intro animations (initial reveal) and update animations (smooth transitions).
 *
 * @module animationHelpers
 */
import type { AnimationConfig, DataPoint } from '../../../config/types';
import type { ResolvedPieSeriesConfig } from '../../../config/OptionResolver';
import type { EasingFunction } from '../../../utils/easing';
/**
 * Intro animation phase state machine.
 */
export type IntroPhase = 'pending' | 'running' | 'done';
/**
 * Domain boundaries with min and max values.
 */
export interface DomainBounds {
    readonly min: number;
    readonly max: number;
}
/**
 * Resolved animation configuration with timing and easing.
 */
export interface ResolvedAnimationConfig {
    readonly delayMs: number;
    readonly durationMs: number;
    readonly easing: EasingFunction;
}
/**
 * Series configuration type that supports all series types.
 */
export type AnySeriesConfig = {
    readonly type: 'line';
    readonly data: ReadonlyArray<DataPoint>;
} | {
    readonly type: 'area';
    readonly data: ReadonlyArray<DataPoint>;
} | {
    readonly type: 'bar';
    readonly data: ReadonlyArray<DataPoint>;
} | {
    readonly type: 'scatter';
    readonly data: ReadonlyArray<DataPoint>;
} | {
    readonly type: 'candlestick';
    readonly data: ReadonlyArray<any>;
} | ResolvedPieSeriesConfig;
/**
 * Clamps a value between 0 and 1.
 *
 * @param value - Value to clamp
 * @returns Clamped value in [0, 1]
 */
export declare function clamp01(value: number): number;
/**
 * Resolves animation configuration from options.
 *
 * Returns null if animation is disabled (false or null).
 * Returns default config if animation is true or an empty object.
 * Converts duration/delay from user config to milliseconds.
 *
 * @param animation - Animation options from chart config
 * @param getEasingFn - Function to resolve easing by name (to avoid circular deps)
 * @returns Resolved animation config or null if disabled
 */
export declare function resolveAnimationConfig(animation: boolean | AnimationConfig | null | undefined, getEasingFn: (name: string) => EasingFunction): ResolvedAnimationConfig | null;
/**
 * Creates an easing function that incorporates delay.
 *
 * The returned function maps t ∈ [0, 1] to an output considering both delay
 * and duration:
 * - t in [0, delay]: output = 0 (delay phase)
 * - t in [delay, delay+duration]: output = easing((t-delay)/duration)
 * - t > delay+duration: output = 1 (complete)
 *
 * @param delayMs - Delay before animation starts (milliseconds)
 * @param durationMs - Animation duration after delay (milliseconds)
 * @param easing - Base easing function to apply after delay
 * @returns Easing function with delay incorporated
 */
export declare function createEasingWithDelay(delayMs: number, durationMs: number, easing: EasingFunction): EasingFunction;
/**
 * Checks if a series configuration has drawable marks.
 *
 * Returns true if the series has data that will produce visible marks:
 * - Pie: at least one slice with value > 0
 * - Cartesian (line/area/bar/scatter/candlestick): at least one data point
 *
 * @param series - Series configuration to check
 * @returns True if series has drawable content
 */
export declare function hasDrawableMarks(series: AnySeriesConfig): boolean;
/**
 * Checks if any series in the list has drawable marks.
 *
 * @param seriesList - Array of series configurations
 * @returns True if at least one series has drawable marks
 */
export declare function hasAnyDrawableMarks(seriesList: ReadonlyArray<AnySeriesConfig>): boolean;
/**
 * Linearly interpolates between two domain bounds.
 *
 * @param from - Starting domain
 * @param to - Ending domain
 * @param t - Interpolation progress [0, 1]
 * @returns Interpolated domain
 */
export declare function lerpDomain(from: DomainBounds, to: DomainBounds, t: number): DomainBounds;
/**
 * Linearly interpolates between two numbers.
 *
 * @param from - Starting value
 * @param to - Ending value
 * @param t - Interpolation progress [0, 1]
 * @returns Interpolated value
 */
export declare function lerp(from: number, to: number, t: number): number;
/**
 * Interpolates cartesian series data between from and to states.
 *
 * Returns null if array lengths don't match (can't interpolate mismatched arrays).
 * Reuses cache array if provided and same length.
 *
 * @param fromData - Starting data points
 * @param toData - Ending data points
 * @param t - Interpolation progress [0, 1]
 * @param cache - Optional cache array to reuse
 * @returns Interpolated data points or null if lengths mismatch
 */
export declare function interpolateCartesianData(fromData: ReadonlyArray<DataPoint>, toData: ReadonlyArray<DataPoint>, t: number, cache: DataPoint[] | null): DataPoint[] | null;
/**
 * Interpolates pie series data between from and to states.
 *
 * Returns the toSeries unchanged if data array lengths don't match.
 * Only interpolates the value property; angles are recomputed by the renderer.
 *
 * @param fromSeries - Starting pie series
 * @param toSeries - Ending pie series
 * @param t - Interpolation progress [0, 1]
 * @param cache - Optional cache array to reuse
 * @returns Interpolated pie series
 */
export declare function interpolatePieData(fromSeries: ResolvedPieSeriesConfig, toSeries: ResolvedPieSeriesConfig, t: number, cache: ResolvedPieSeriesConfig['data'] | null): ResolvedPieSeriesConfig;
/**
 * Checks if two domain bounds are equal.
 *
 * @param a - First domain
 * @param b - Second domain
 * @returns True if domains have identical min and max
 */
export declare function isDomainEqual(a: DomainBounds, b: DomainBounds): boolean;
/**
 * Determines the next intro phase based on current state and conditions.
 *
 * State machine transitions:
 * - pending → running: when has drawable marks and animation enabled
 * - running → done: when animation completes
 * - done → pending: when retriggering (e.g., visibility change)
 *
 * @param currentPhase - Current intro phase
 * @param hasDrawable - Whether series have drawable marks
 * @param animationEnabled - Whether animation is enabled
 * @param retrigger - Whether to retrigger from done state
 * @returns Next intro phase
 */
export declare function computeNextIntroPhase(currentPhase: IntroPhase, hasDrawable: boolean, animationEnabled: boolean, retrigger?: boolean): IntroPhase;
/**
 * Applies intro animation progress to create an animated bar Y scale.
 *
 * During intro, bars grow from the zero line (or domain min if no zero).
 * This creates a scale that compresses bars based on progress.
 *
 * @param baseYScale - Original Y scale
 * @param yMin - Domain minimum
 * @param yMax - Domain maximum
 * @param progress - Animation progress [0, 1]
 * @returns Y coordinate adjusted for intro animation
 */
export declare function applyBarIntroProgress(baseY: number, yMin: number, yMax: number, progress: number): number;
//# sourceMappingURL=animationHelpers.d.ts.map