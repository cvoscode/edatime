export type EasingFunction = (t: number) => number;
import type { AnimationConfig } from '../config/types';
export type EasingName = NonNullable<AnimationConfig['easing']>;
export declare function easeLinear(t: number): number;
export declare function easeCubicOut(t: number): number;
export declare function easeCubicInOut(t: number): number;
export declare function easeBounceOut(t: number): number;
export declare function getEasing(name: AnimationConfig['easing'] | null | undefined): EasingFunction;
//# sourceMappingURL=easing.d.ts.map