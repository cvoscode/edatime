# ai/frontend/src/chart/DataChart.md
> ChartGPU-backed timeseries chart with zoom/pan, overlays, exports, and timeseries-specific axis/legend behavior.

## Class `DataChart`
- `constructor(containerId: string, onZoomCallback: ((view: ViewSnapshot, sourceKind: string) => void) | null, onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null = null, onZoomOutCallback: (() => void) | null = null)`
- `init(): Promise<void>`
- `destroy(): void`
- `deepDispose(): void`
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
  - Enables or disables Y-axis lower-bound clamping at zero; non-negative series now keep the padded floor clamped above zero.
- `isStackFromZero(): boolean`
- `getYRange(): { min: number; max: number } | null`
- `cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null`
- `fitYToData(): void`
- `onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void`
- `onClick(callback: (data: ChartGPUEventPayload) => void): void`
- `updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void`
  - Renders the dataset plus per-series rolling-band colors and anomaly overlays.
- `exportPNG(): Promise<void>`
- `exportSVG(): Promise<void>`
- `exportHTML(): Promise<void>`
