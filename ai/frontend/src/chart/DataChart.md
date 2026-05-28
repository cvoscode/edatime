# DataChart.ts

Main data chart component using ChartGPU WebGPU adapter with drawing overlay, mouse-selection zoom, and PNG/SVG/HTML export.

## Class: DataChart

```typescript
export class DataChart {
  containerId: string;
  onZoomCallback: ((start: number, end: number, sourceKind: string) => void) | null;
  onYRangeCallback: ((min: number, max: number, sourceKind: string) => void) | null;
  onZoomOutCallback: (() => void) | null;
  chartInstance: ChartInstanceAPI | null;

  constructor(
    containerId: string,
    onZoomCallback: ((start: number, end: number, sourceKind: string) => void) | null,
    onYRangeCallback?: ((min: number, max: number, sourceKind: string) => void) | null,
    onZoomOutCallback?: (() => void) | null,
  );
}
```

### Methods

```typescript
destroy(): void;
deepDispose(): void;
setChartText(title: string, xLabel: string, yLabel: string): void;
setDrawMode(mode: string, color?: string, width?: number): void;
clearDrawings(): void;
requestOverlayRender(): void;
resize(): void;
setXRange(minMs: number, maxMs: number): void;
async init(): Promise<void>;
supportsZoomControls(): boolean;
getXDomain(): { min: number; max: number } | null;
setYRange(min: number, max: number): void;
getYRange(): { min: number; max: number } | null;
cssPointToData(clientX: number, clientY: number): { x: number; y: number } | null;
zoomY(_factor: number, _anchorNormalized?: number): void;
resetYRange(): void;
fitYToData(): void;
onCrosshairMove(callback: (data: ChartGPUCrosshairMovePayload) => void): void;
onClick(callback: (data: ChartGPUEventPayload) => void): void;
updateDataMulti(dataObj: FilteredDataObject, columns: string[]): void;
async exportPNG(): Promise<void>;
async exportSVG(): Promise<void>;
async exportHTML(): Promise<void>;
exportSVGDrawings(viewWidth: number, viewHeight: number): string;
```

## Interfaces

```typescript
interface ChartInstanceAPI {
  readonly disposed: boolean;
  readonly options: Readonly<ChartGPUOptions>;
  setOption(options: ChartGPUOptions): void;
  getZoomRange(): { start: number; end: number } | null;
  setZoomRange(start: number, end: number, source?: unknown): void;
  resize(): void;
  dispose(): void;
  on(eventName: 'crosshairMove', callback: (payload: ChartGPUCrosshairMovePayload) => void): void;
  on(eventName: 'click', callback: (payload: ChartGPUEventPayload) => void): void;
  off(eventName: 'crosshairMove', callback: (payload: ChartGPUCrosshairMovePayload) => void): void;
  off(eventName: 'click', callback: (payload: ChartGPUEventPayload) => void): void;
}

interface DrawItem {
  type: string;
  color: string;
  width: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
```
