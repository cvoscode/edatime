export type ZoomRange = Readonly<{
    start: number;
    end: number;
}>;
export type ZoomRangeChangeCallback = (range: ZoomRange) => void;
export interface ZoomState {
    /**
     * Returns the current zoom window in percent space, clamped to [0, 100].
     */
    getRange(): ZoomRange;
    /**
     * Sets the zoom window in percent space.
     */
    setRange(start: number, end: number): void;
    /**
     * Zooms in around `center` by shrinking the span by `factor`.
     *
     * `factor <= 1` is treated as a no-op.
     */
    zoomIn(center: number, factor: number): void;
    /**
     * Zooms out around `center` by growing the span by `factor`.
     *
     * `factor <= 1` is treated as a no-op.
     */
    zoomOut(center: number, factor: number): void;
    /**
     * Pans the zoom window by `delta` percent points (preserving span).
     */
    pan(delta: number): void;
    /**
     * Subscribes to changes. Returns an unsubscribe function.
     */
    onChange(callback: ZoomRangeChangeCallback): () => void;
}
export type ZoomSpanConstraints = Readonly<{
    /**
     * Minimum allowed span (percent points in [0, 100]).
     */
    readonly minSpan?: number;
    /**
     * Maximum allowed span (percent points in [0, 100]).
     */
    readonly maxSpan?: number;
}>;
export type ZoomRangeAnchor = 'start' | 'end' | 'center' | Readonly<{
    center: number;
    ratio: number;
}>;
export interface ZoomStateWithConstraints extends ZoomState {
    /**
     * Updates span constraints at runtime (used by coordinator on setOption/appendData).
     *
     * Passing `undefined` leaves that constraint unchanged.
     */
    setSpanConstraints(minSpan?: number, maxSpan?: number): void;
    /**
     * Sets a range with an explicit anchor for clamping (used by slider handles).
     */
    setRangeAnchored(start: number, end: number, anchor: ZoomRangeAnchor): void;
}
export declare function createZoomState(initialStart: number, initialEnd: number, constraints?: ZoomSpanConstraints): ZoomStateWithConstraints;
//# sourceMappingURL=createZoomState.d.ts.map