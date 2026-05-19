export type HoverTarget = Readonly<{
    seriesIndex: number;
    dataIndex: number;
}>;
export type HoverChangeCallback = (hovered: HoverTarget | null) => void;
export interface HoverState {
    setHovered(seriesIndex: number, dataIndex: number): void;
    clearHovered(): void;
    getHovered(): HoverTarget | null;
    onChange(callback: HoverChangeCallback): () => void;
    destroy?: () => void;
}
/**
 * Tracks hovered series/data indices and notifies listeners on changes.
 *
 * - Updates are debounced to avoid spamming downstream work during rapid pointer movement.
 * - Listeners fire only when the hovered target actually changes.
 */
export declare function createHoverState(): HoverState;
//# sourceMappingURL=createHoverState.d.ts.map