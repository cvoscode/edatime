# ai/frontend/src/chart/DataChart.md
> ChartGPU WebGPU adapter with drawing overlay, mouse-selection zoom, and PNG/SVG/HTML export.

## Class: DataChart
- `constructor(containerId: string, onZoomCallback: ((start: number, end: number, sourceKind: string) => void) | null, onYRangeCallback?: ((min: number, max: number, sourceKind: string) => void) | null, onZoomOutCallback?: (() => void) | null)`
  - Initializes the chart with callbacks for zoom and Y-range changes.
- `async init(): Promise<void>`
  - Creates the ChartGPU instance, sets up resize observer, drawing overlay, text overlays, and mouse-selection zoom.
- `destroy(): void`
  - Tears down resize observers and releases the chart instance.
- `deepDispose(): void`
  - Full disposal including overlay canvas, selection box, and GPU device-lost guard.
- `setChartText(title: string, xLabel: string, yLabel: string): void`
  - Updates chart title and axis label overlays.
- `setDrawMode(mode: string, color?: string, width?: number): void`
  - Activates drawing mode with color and stroke width.
- `clearDrawings(): void`
  - Clears all stored drawings.
- `requestOverlayRender(): void`
  - Schedules a drawing render on the next animation frame.
- `resize(): void`
  - Resizes the chart and re-renders drawings.
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
  - Builds and updates series configs with optional color-by-column support.

---
[1]: ./chartOverlays.md#ChartOverlays
[2]: ./colorScale.md#buildColorizedSeries
[3]: ./ticks.md#niceLinearTicks
[4]: ./chartInteractions.md#initBoxZoom
