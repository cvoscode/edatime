# frontend/src/ui/viewport.ts
> Zoom, view-history, and chart-gesture controls.

## Functions
- `refreshZoomControlsState(): void`
  - Updates zoom reset button disabled state.
- `updateZoomRangeBadge(): void`
  - Updates the zoom percentage badge display.
- `getCurrentView(): ViewSnapshot`
  - Gets current viewport as xMin/xMax/yMin/yMax.
- `applyViewport(view, fetchAndRender, sourceKind?): void`
  - Applies a viewport snapshot and triggers re-fetch.
- `zoomOut(fetchAndRender): void`
  - Zooms out one step in zoom history.
- `resetZoom(fetchAndRender): void`
  - Resets to initial view.
- `initChartPageFilterGesture(): void`
  - Initializes context menu filter gesture on chart.
- `initResetZoomListener(fetchAndRender): void`
  - Listens for `edatime:reset-zoom` events and calls `zoomOut(fetchAndRender)`.
- `initZoomOutListener(fetchAndRender): void`
  - Listens for `edatime:zoom-out` events and calls `zoomOut(fetchAndRender)`. Wired to the toolbar `#zoom-out-btn` so a real fetch happens (the previous direct call in `exportControls.ts` used an empty `fetchAndRender` and left the chart visually stuck at the zoomed-in range).
