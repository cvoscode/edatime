export interface Tooltip {
    /**
     * Show tooltip at container-local CSS pixel coordinates.
     *
     * `content` is treated as HTML (assigned via `innerHTML`).
     */
    show(x: number, y: number, content: string): void;
    hide(): void;
    dispose(): void;
}
export declare function createTooltip(container: HTMLElement): Tooltip;
//# sourceMappingURL=createTooltip.d.ts.map