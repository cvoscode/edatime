import type { ZoomState } from '../interaction/createZoomState';
import type { ThemeConfig } from '../themes/types';
export interface DataZoomSlider {
    update(theme: ThemeConfig): void;
    dispose(): void;
}
export interface DataZoomSliderOptions {
    readonly height?: number;
    readonly marginTop?: number;
    readonly zIndex?: number;
    readonly showPreview?: boolean;
}
export declare function createDataZoomSlider(container: HTMLElement, zoomState: ZoomState, options?: DataZoomSliderOptions): DataZoomSlider;
//# sourceMappingURL=createDataZoomSlider.d.ts.map