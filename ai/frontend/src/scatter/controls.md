# ai/frontend/src/scatter/controls.md
> Scatter control wiring — all event listeners bound to scatter page controls. Does NOT import from scatterPage.ts to avoid circular deps.

## Interface: ScatterRenderCallbacks
```ts
interface ScatterRenderCallbacks {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    renderScatter: () => Promise<void>;
    refreshCorrelationsAndSuggestions: () => Promise<void>;
    refreshActiveScatterView: () => Promise<void>;
    setScatterView: (viewName: string, options?: { render?: boolean }) => Promise<void>;
    handleErr: (err: unknown) => void;
    rerenderScatterFromCache: (resetViewFlag?: boolean) => Promise<void>;
    renderScatterDebounced: () => void;
    syncScatterFilterBadge: () => void;
}
```

## Module-Scoped State
- `nextBindIndex(): number` — returns a monotonically increasing bind index stored on `globalThis.__scatterBindIndex`.
- `latestBindIndex(): number` — returns the current global bind index.
- `zoomBadgeInterval: number | null` — singleton interval handle. Created lazily on the first `bindScatterControls` call so repeated bindings do not multiply timers.
- `refreshLatestZoomBadge: () => void` — captured reference to the latest `refreshBadge` closure. The interval always invokes the most recent closure so successive bindings stay in sync.

## Functions

### `updateRangeFill(input: HTMLInputElement | null): void`
- Sets `--range-fill` CSS custom property on a range input to reflect the fill percentage of the current value within the min/max span. Used by the bin-size and suggestion-threshold sliders.

### `bindScatterControls(cb: ScatterRenderCallbacks): void`
- Binds all scatter control event listeners: X/Y column selects, bin size, normalization, render mode, diagonal mode (routes to `rerender()` in single-plot or `refreshActiveScatterView()` in matrix), color column/scale, linked brush, suggestion threshold, matrix mode toggle, export buttons (PNG/SVG/HTML/CSV/Parquet), view-change buttons, and page-change/filter event listeners.
- **Matrix mode toggle** now uses `[data-matrix-mode]` button group and a hidden `#scatter-matrix-mode` input instead of a `<select>`.
- **Zoom controls:** wires `#scatter-zoom-out-btn` and `#scatter-zoom-reset-btn` to pop the zoom history / reset to the full extent, with `#scatter-zoom-range-badge` reflecting the current zoom ratio via a 4Hz interval. The interval is installed exactly once across all `bindScatterControls` calls.
- **Page-change handler** uses a bind-index guard (`nextBindIndex`/`latestBindIndex`) on `globalThis` so only the latest `bindScatterControls` invocation processes events. Sets `appState.scatter.lastQueryContextKey` after render. When metadata is missing defers to `cb.initScatterPage(appState.metadata)`. When the query-context matches the cached key, returns early without re-rendering.
- **`edatime:clear-all-filters` handler:** clears column ranges (`setColumnRanges({})`), adaptive line filters (`setAdaptiveLineFilters([])`), then calls `syncScatterFilterBadge()` and `refreshActiveScatterView()`. Uses bind-index guard to prevent stale handlers from firing.

---
[1]: ./scatterPage.md
[2]: ../types.md#DatasetMetadata
[3]: ../utils/settings.md
[4]: ./correlationsPanel.md#openScatterPairInCausal
