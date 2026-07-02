# ai/frontend/src/chart/DataChart.md
> ChartGPU-backed timeseries chart with zoom/pan, drawing overlays, exports, legend overlay, and optional Y-axis baseline clamping.

## Class `DataChart`
- `constructor(containerId: string, onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null = null, onZoomOutCallback: (() => void) | null = null)`
  - Creates the chart wrapper and stores zoom/Y-range callbacks.
- `init(): Promise<void>`
  - Creates the ChartGPU instance, overlay canvas, zoom/pan bindings, and legend overlay.
- `destroy(): void`
  - Removes observers and legend state without forcing a deep chart teardown.
- `deepDispose(): void`
  - Fully disposes the chart instance, overlays, selection box, and cached state.
- `setChartText(title: string, xLabel: string, yLabel: string): void`
- `setDrawMode(mode: string, color?: string, width?: number): void`
- `clearDrawings(): void`
- `requestOverlayRender(): void`
- `resize(): void`
- `setXRange(minMs: number, maxMs: number): void`
- `supportsZoomControls(): boolean`
- `getXDomain(): { min: number; max: number } | null`
- `setYRange(min: number, max: number): void`
- `setStackFromZero(on: boolean): void`
  - Enables or disables Y-axis lower-bound clamping at zero for later renders.
- `isStackFromZero(): boolean`
- `getYRange(): { min: number; max: number } | null`
- `cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null`
- `fitYToData(): void`
- `onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void`
- `onClick(callback: (data: ChartGPUEventPayload) => void): void`
- `updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void`
- `exportPNG(): Promise<void>`
- `exportSVG(): Promise<void>`
- `exportHTML(): Promise<void>`
