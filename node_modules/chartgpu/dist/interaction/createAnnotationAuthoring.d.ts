/**
 * Annotation authoring helper for ChartGPU instances.
 *
 * Provides right-click context menu for adding vertical lines and text annotations,
 * with undo/redo, JSON export, drag-to-reposition, and editing capabilities.
 */
import type { ChartGPUInstance } from '../ChartGPU';
import type { AnnotationConfig } from '../config/types';
/**
 * Configuration options for annotation authoring.
 */
export interface AnnotationAuthoringOptions {
    /**
     * Z-index for the context menu (default: 1000).
     */
    readonly menuZIndex?: number;
    /**
     * Enable right-click context menu (default: true).
     */
    readonly enableContextMenu?: boolean;
}
/**
 * Annotation authoring instance returned by `createAnnotationAuthoring`.
 *
 * Provides programmatic control over annotations and manages UI lifecycle.
 */
export interface AnnotationAuthoringInstance {
    /**
     * Programmatically add a vertical line annotation.
     *
     * @param x - X-coordinate in data domain units
     */
    addVerticalLine(x: number): void;
    /**
     * Programmatically add a text annotation.
     *
     * @param x - X-coordinate (domain units for 'data' space, fraction [0-1] for 'plot' space)
     * @param y - Y-coordinate (domain units for 'data' space, fraction [0-1] for 'plot' space)
     * @param text - Annotation text content
     * @param space - Coordinate space: 'data' (default) or 'plot'
     */
    addTextNote(x: number, y: number, text: string, space?: 'data' | 'plot'): void;
    /**
     * Undo the last annotation change.
     *
     * @returns `true` if undo was successful, `false` if nothing to undo
     */
    undo(): boolean;
    /**
     * Redo a previously undone change.
     *
     * @returns `true` if redo was successful, `false` if nothing to redo
     */
    redo(): boolean;
    /**
     * Export current annotations as JSON string.
     *
     * @returns JSON string representation of annotations array
     */
    exportJSON(): string;
    /**
     * Get the current annotations array.
     *
     * @returns Readonly copy of current annotations
     */
    getAnnotations(): readonly AnnotationConfig[];
    /**
     * Clean up event listeners and DOM elements.
     *
     * Safe to call multiple times. After disposal, the instance should not be used.
     */
    dispose(): void;
}
/**
 * Creates an annotation authoring helper for a chart instance.
 *
 * Features:
 * - Right-click context menu for adding vertical lines and text annotations
 * - Optional toolbar with undo/redo/export buttons
 * - Undo/redo history (50 entries max)
 * - JSON export with clipboard integration
 * - Automatic coordinate conversion (data-space and plot-space)
 * - Event listener cleanup on dispose
 *
 * Annotations are persisted by calling `chart.setOption({ ...options, annotations })`,
 * so they integrate seamlessly with the chart's option system.
 *
 * @param container - The chart container element (must contain the chart canvas)
 * @param chart - The ChartGPU instance
 * @param options - Optional configuration for menu/toolbar z-index and visibility
 * @returns Annotation authoring instance with programmatic API and dispose method
 * @throws Error if canvas is not found
 *
 * @example
 * ```ts
 * const chart = await ChartGPU.create(container, options);
 * const authoring = createAnnotationAuthoring(container, chart, {
 *   showToolbar: true,
 *   enableContextMenu: true,
 * });
 *
 * // Programmatic API
 * authoring.addVerticalLine(Date.now());
 * authoring.addTextNote(x, y, 'Peak', 'data');
 * authoring.undo();
 * authoring.redo();
 * const json = authoring.exportJSON();
 *
 * // Cleanup
 * authoring.dispose();
 * chart.dispose();
 * ```
 */
export declare function createAnnotationAuthoring(container: HTMLElement, chart: ChartGPUInstance, options?: AnnotationAuthoringOptions): AnnotationAuthoringInstance;
//# sourceMappingURL=createAnnotationAuthoring.d.ts.map