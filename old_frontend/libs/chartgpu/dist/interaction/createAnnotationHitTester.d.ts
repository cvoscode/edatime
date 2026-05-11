/**
 * Hit testing for chart annotations
 *
 * Detects which annotation (if any) the user clicked or hovered over.
 * Uses canvas-space coordinates and configurable hit tolerances.
 */
import type { AnnotationConfig } from '../config/types.js';
import type { ChartGPUInstance } from '../ChartGPU.js';
export interface AnnotationHitTestResult {
    readonly annotationIndex: number;
    readonly annotation: AnnotationConfig;
    readonly hitType: 'line' | 'text' | 'point' | 'label';
    readonly distanceCssPx: number;
}
export interface AnnotationHitTesterOptions {
    readonly lineTolerance?: number;
    readonly textTolerance?: number;
    readonly pointTolerance?: number;
    readonly labelTolerance?: number;
    readonly spatialGridThreshold?: number;
}
export interface AnnotationHitTester {
    hitTest(canvasX: number, canvasY: number): AnnotationHitTestResult | null;
    updateTextBounds(textBounds: Map<number, DOMRect>): void;
    invalidateCache(): void;
    dispose(): void;
}
/**
 * Creates an annotation hit tester for detecting pointer interactions
 */
export declare function createAnnotationHitTester(chart: ChartGPUInstance, canvas: HTMLCanvasElement, options?: AnnotationHitTesterOptions): AnnotationHitTester;
//# sourceMappingURL=createAnnotationHitTester.d.ts.map