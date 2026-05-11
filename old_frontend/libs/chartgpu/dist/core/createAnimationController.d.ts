import type { EasingFunction } from '../utils/easing';
export type AnimationId = symbol;
export interface AnimationController {
    animate(from: number, to: number, duration: number, easing: EasingFunction, onUpdate: (value: number) => void, onComplete?: () => void): AnimationId;
    animate(from: ReadonlyArray<number>, to: ReadonlyArray<number>, duration: number, easing: EasingFunction, onUpdate: (value: ReadonlyArray<number>) => void, onComplete?: () => void): AnimationId;
    cancel(animationId: AnimationId): void;
    cancelAll(): void;
    /**
     * Progresses all active animations to `timestamp` (ms).
     * Intended to be called once per frame by the caller (e.g. a render loop).
     */
    update(timestamp: number): void;
}
export declare function createAnimationController(): AnimationController;
//# sourceMappingURL=createAnimationController.d.ts.map