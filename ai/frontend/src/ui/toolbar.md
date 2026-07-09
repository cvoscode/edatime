# ai/frontend/src/ui/toolbar.md
> Thin orchestrator that delegates toolbar controls (zoom, draw, labels, export, analysis status) to focused sub-modules.

## Exports (from submodules)
- `analysisStatus`: `updateAnalysisZoom, updateAnalysisYRange, updateAnalysisCursor, updateAnalysisClick`
- `viewport`: `refreshZoomControlsState, getCurrentView, applyViewport, zoomOut, resetZoom, initChartPageFilterGesture`
- `exportControls`: `exportChartFilteredData`

## Functions

### bindAnalysisChartEvents
- `bindAnalysisChartEvents(): void`
  - Binds chart crosshair and click events to analysis status display. Guards against double-binding via `appState.analysisBound` flag.

### setComputeLoading
- `setComputeLoading(btnId: string, overlayId: string, loading: boolean, label?: string): void`
  - Syncs a compute button's disabled state and text with a loading overlay's visibility.

### initAnalysisControls
- `initAnalysisControls(fetchAndRender: () => void): void`
  - Wires all sub-controls (toolbar modals, draw controls, chart text, analytics drawer, reset-zoom + zoom-out listeners) and registers `exportChartFilteredData` on `window.__edatime`.

### initPages
- `initPages(): void`
  - Initialises page navigation (sidebar item wiring).