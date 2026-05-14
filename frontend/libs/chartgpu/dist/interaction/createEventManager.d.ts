import type { GridArea } from '../renderers/createGridRenderer';
export type ChartGPUEventName = 'mousemove' | 'click' | 'mouseleave';
export type ChartGPUEventPayload = {
    readonly x: number;
    readonly y: number;
    readonly gridX: number;
    readonly gridY: number;
    /** Plot (grid) width in CSS pixels. */
    readonly plotWidthCss: number;
    /** Plot (grid) height in CSS pixels. */
    readonly plotHeightCss: number;
    readonly isInGrid: boolean;
    readonly originalEvent: PointerEvent;
};
export type ChartGPUEventCallback = (payload: ChartGPUEventPayload) => void;
export interface EventManager {
    readonly canvas: HTMLCanvasElement;
    on(event: ChartGPUEventName, callback: ChartGPUEventCallback): void;
    off(event: ChartGPUEventName, callback: ChartGPUEventCallback): void;
    updateGridArea(gridArea: GridArea): void;
    dispose(): void;
}
export declare function createEventManager(canvas: HTMLCanvasElement, initialGridArea: GridArea): EventManager;
//# sourceMappingURL=createEventManager.d.ts.map