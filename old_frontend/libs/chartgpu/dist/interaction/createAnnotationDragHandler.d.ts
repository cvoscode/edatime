/**
 * Drag handler for repositioning annotations
 *
 * Handles dragging annotations to reposition them:
 * - lineX: constrained to horizontal movement
 * - lineY: constrained to vertical movement
 * - text: free 2D movement (data or plot space)
 * - point: free 2D movement (data space)
 *
 * Uses optimistic updates during drag for 60 FPS performance.
 */
import type { AnnotationConfig } from '../config/types.js';
import type { ChartGPUInstance } from '../ChartGPU.js';
export interface AnnotationDragCallbacks {
    onDragMove: (index: number, updates: Partial<AnnotationConfig>) => void;
    onDragEnd: (index: number, updates: Partial<AnnotationConfig>) => void;
    onDragCancel: () => void;
}
export interface AnnotationDragHandler {
    startDrag(annotationIndex: number, annotation: AnnotationConfig, startPointerX: number, startPointerY: number): void;
    isDragging(): boolean;
    dispose(): void;
}
/**
 * Creates a drag handler for repositioning annotations
 */
export declare function createAnnotationDragHandler(chart: ChartGPUInstance, canvas: HTMLCanvasElement, callbacks: AnnotationDragCallbacks): AnnotationDragHandler;
//# sourceMappingURL=createAnnotationDragHandler.d.ts.map