export type TextOverlayAnchor = 'start' | 'middle' | 'end';
export interface TextOverlayLabelOptions {
    readonly fontSize?: number;
    readonly color?: string;
    readonly anchor?: TextOverlayAnchor;
    /**
     * Rotation in degrees (CSS `rotate(<deg>deg)`).
     */
    readonly rotation?: number;
}
export interface TextOverlayOptions {
    /**
     * When true, clip labels to the overlay bounds (default: false).
     * Prevents labels from overflowing outside the container.
     */
    readonly clip?: boolean;
}
export interface TextOverlay {
    clear(): void;
    addLabel(text: string, x: number, y: number, options?: TextOverlayLabelOptions): HTMLSpanElement;
    dispose(): void;
}
export declare function createTextOverlay(container: HTMLElement, options?: TextOverlayOptions): TextOverlay;
//# sourceMappingURL=createTextOverlay.d.ts.map