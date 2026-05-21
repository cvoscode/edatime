import type { ZoomState } from '../interaction/createZoomState';
import type { ThemeConfig } from '../themes/types';
export interface ZoomResetButton {
    update(theme: ThemeConfig): void;
    dispose(): void;
}
export declare function createZoomResetButton(container: HTMLElement, zoomState: ZoomState, theme: ThemeConfig): ZoomResetButton;
//# sourceMappingURL=createZoomResetButton.d.ts.map