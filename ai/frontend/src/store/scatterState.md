# frontend/src/store/scatterState.ts
> Scatter analytics page state management.

## Interfaces

```typescript
export interface ScatterView {
    xMin: number; xMax: number; yMin: number; yMax: number;
}

export interface ScatterDrag {
    pointerId: number;
    startX: number; endX: number;
    startY: number; endY: number;
}

export interface DensityTooltipMeta {
    colorCenter: number; colorLo: number; colorHi: number;
}

export interface DensityTooltipCache {
    key: string;
    binSize: number;
    metrics: { plotWidth: number; plotHeight: number } | null;
    binsBySeriesIndex: Map<number, Map<string, number>>;
    metaBySeriesIndex: Map<number, DensityTooltipMeta>;
}

export interface MatrixCellData {
    totalPoints: number;
    points: [number, number][];
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
}

export interface ScatterFetchOptions {
    start?: number;
    end?: number;
    filters?: ScatterFilterSpec[];
    lineFilters?: ScatterLineFilterSpec[];
}

export interface ScatterState {
    chart: ChartGPUInstance | null;
    initialized: boolean;
    pageInitialized: boolean;
    activeView: string;
    loading: boolean;
    metadata: DatasetMetadata | null;
    totalPoints: number;
    allPoints: [number, number][];
    points: [number, number][];
    allColorValues: number[] | null;
    allColorLabels: unknown[] | null;
    full: ScatterView;
    view: ScatterView;
    zoomHistory: ScatterView[];
    drag: ScatterDrag | null;
    selectionBox: HTMLDivElement | null;
    colorColumn: string;
    colorValues: number[] | null;
    colorLabels: unknown[] | null;
    colorMin: number | null;
    colorMax: number | null;
    correlationsByColumn: Map<string, { pearson?: number | null; spearman?: number | null; column?: string }>;
    suggestionThreshold: number;
    lastBinnedText: string;
    lastUpdateMs: number;
    densityTooltipCache: DensityTooltipCache | null;
    lastOptionSeries: SeriesConfig[] | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>;
    lastRenderSignature: string;
    matrixCache: Map<string, Promise<MatrixCellData>>;
    matrixColumnOrder: string[];
    overviewRequestId: number;
    scatterRequestId: number;
}
```

## Exports

### State
- `scatterState: ScatterState`

### Mutations
- `setScatterChart(chart: ChartGPUInstance | null): void`
- `setScatterInitialized(v: boolean): void`
- `setScatterPageInitialized(v: boolean): void`
- `setScatterView(view: ScatterView): void`
- `setScatterActiveView(view: string): void`
- `setScatterPoints(allPoints: [number, number][], points: [number, number][]): void`
- `setScatterColorState(column: string, colorValues: number[] | null, colorLabels: unknown[] | null, colorMin: number | null, colorMax: number | null): void`
- `setScatterMetadata(metadata: DatasetMetadata | null): void`
- `setScatterLoading(v: boolean): void`
- `setScatterTotalPoints(n: number): void`
- `replaceScatterState(next: Partial<ScatterState>): void`

---
[1]: events.md

```typescript
export const scatterState: ScatterState
```

## Functions

```typescript
export function setScatterChart(chart: ChartGPUInstance | null): void
export function setScatterInitialized(v: boolean): void
export function setScatterPageInitialized(v: boolean): void
export function setScatterView(view: ScatterView): void
export function setScatterActiveView(view: string): void
export function setScatterPoints(allPoints: [number, number][], points: [number, number][]): void
export function setScatterColorState(
    column: string,
    colorValues: number[] | null,
    colorLabels: unknown[] | null,
    colorMin: number | null,
    colorMax: number | null,
): void
export function setScatterMetadata(metadata: DatasetMetadata | null): void
export function setScatterLoading(v: boolean): void
export function setScatterTotalPoints(n: number): void
export function replaceScatterState(next: Partial<ScatterState>): void
```