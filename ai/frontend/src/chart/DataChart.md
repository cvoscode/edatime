# ai/frontend/src/chart/DataChart.md
> ChartGPU WebGPU adapter with drawing overlay, mouse-selection zoom, PNG/SVG/HTML export, draggable legend overlay, and theme-aware color palette. Caches the last chart options and last applied theme so theme changes can be re-applied via `chartInstance.setOption` without a full re-render.

## Class: DataChart
- `constructor(containerId: string, onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCallback?: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCallback?: (() => void) | null)`
  - Initializes the chart with callbacks for zoom and Y-range changes.
- `async init(): Promise<void>`
  - Creates the ChartGPU instance with `legend.show = false`, sets up resize observer, drawing overlay, text overlays, mouse-selection zoom, and the **legend overlay** (`_syncLegendOverlay`). Builds the initial theme via `_buildChartGpuTheme()` and stores it in `_lastAppliedTheme`.
- `destroy(): void`
  - Tears down resize observers, removes the legend overlay, clears `_legendPosition` and `_legendDragState`, and releases the chart instance.
- `deepDispose(): void`
  - Full disposal including overlay canvas, selection box, legend overlay, and GPU device-lost guard.
- `setChartText(title: string, xLabel: string, yLabel: string): void`
  - Updates chart title and axis label overlays.
- `setDrawMode(mode: string, color?: string, width?: number): void`
  - Activates drawing mode with color and stroke width.
- `clearDrawings(): void`
  - Clears all stored drawings.
- `requestOverlayRender(): void`
  - Schedules a drawing render on the next animation frame.
- `resize(): void`
  - Resizes the chart, re-applies the legend position, and re-renders drawings.
- `setXRange(minMs: number, maxMs: number): void`
  - Sets the visible time range.
- `supportsZoomControls(): boolean`
  - Returns true when a chart instance is active.
- `getXDomain(): { min: number; max: number } | null`
  - Returns the last data-driven X domain.
- `setYRange(min: number, max: number): void`
  - Sets the Y axis range.
- `getYRange(): { min: number; max: number } | null`
  - Returns the current Y range.
- `cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null`
  - Converts CSS coordinates to data coordinates.
- `fitYToData(): void`
  - Emits the last data-driven Y range via the Y-range callback.
- `onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void`
  - Subscribes to crosshair move events on the ChartGPU instance.
- `onClick(callback: (data: ChartGPUEventPayload) => void): void`
  - Subscribes to click events on the ChartGPU instance.
- `updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void`
  - Builds and updates series configs with optional color-by-column support. Caches the resulting `setOption` payload (with the current `theme` field) in `_lastChartOptions` and forces `legend.show = false`. Calls `_syncLegendOverlay()` and `_renderDrawings()` after applying.
- `exportSVG(): Promise<void>`
  - Builds the export canvas with **drawings baked in** (`_getCombinedExportCanvas(true)`) and embeds the resulting PNG into an `<svg>` wrapper. PNG and SVG exports now share the same visual content.
- `_buildChartGpuTheme(): unknown`
  - Internal: derives a ChartGPU theme object from the resolved theme.
- `_getChartColorPalette(): string[]`
  - Internal: returns the per-theme color palette used for series colors.
- `_onThemeChanged(theme: ResolvedTheme): void`
  - Internal: re-builds the theme and color palette, then calls `chartInstance.setOption(_lastChartOptions)` to apply the new theme without re-fetching data.
- `_syncLegendOverlay(): void` (private)
  - Rebuilds the legend overlay DOM. Each row is a `<button>` with a color swatch and series label; clicking toggles the series visibility through `_toggleLegendTrace`. The overlay title includes "Ctrl+click + drag to move".
- `_getLegendEntries(): { name, color, visible }[]` (private)
  - Deduplicates marker-suffixed series (e.g. `name__markers`) by their base name and falls back to the chart palette for missing colors.
- `_toggleLegendTrace(name: string): void` (private)
  - Toggles the `visible` flag on every series that matches `baseSeriesName(name)` and reapplies the option with `legend.show = false`. Reflects the change in the overlay and re-renders drawings.
- `_getDefaultLegendPosition(): LegendPosition` (private)
  - Returns the default top-right legend position, clamped to the chart container.
- `_clampLegendPosition(position: LegendPosition): LegendPosition` (private)
  - Clamps a desired position to the chart container with an 8px margin.
- `_applyLegendPosition(position: LegendPosition): void` (private)
  - Applies the position to `_legendEl` and updates `_legendPosition`.
- `_startLegendDrag(event: PointerEvent)`, `_moveLegendDrag(event)`, `_finishLegendDrag(event)` (private)
  - Drag handlers that move the legend while the user holds Ctrl/Cmd. Drag origin is captured with `setPointerCapture`.

## Notes
- `_lastChartOptions` and `_lastAppliedTheme` are private fields used to support theme reactivity without forcing a full data refetch.
- `onZoom` callback now receives a `ViewSnapshot` (`{ xMin, xMax, yMin, yMax }`) — see [ensureTimeseriesReady][5] for the wrapper that converts `(start, end, sourceKind)` to that shape.
- The legend overlay (`_legendEl`, `_legendPosition`, `_legendDragState`) replaces the previous ChartGPU-native legend (`legend: { show: true, position: 'right' }`). The native legend is now `show: false`; the overlay renders the same content with click-to-toggle visibility and Ctrl+drag-to-move.

---
[1]: ./chartOverlays.md#ChartOverlays
[2]: ./colorScale.md#buildColorizedSeries
[3]: ./ticks.md#niceLinearTicks
[4]: ./chartInteractions.md#initBoxZoom
[5]: ../app/bootstrap/ensureTimeseriesReady.md
