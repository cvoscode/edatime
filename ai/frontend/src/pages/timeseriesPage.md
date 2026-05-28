# timeseriesPage.ts

Main timeseries page.

## Constants

```typescript
EMPTY_TIMESERIES_DATA: { ts: [], values: {}, series: {}, colorByColumn: {} }
```

## Interfaces

```typescript
interface TimeseriesControllerDeps {
    fetchData: (startIso: string, endIso: string, width: number, cols: string, colorCol: string | null, signal: AbortSignal) => Promise<any>;
    buildRangeControls: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    updateAnalysisZoom: (start: number, end: number, sourceKind?: string) => void;
    getCurrentView: () => any;
    fetchAndRenderAnalytics: () => Promise<void>;
}
```

## State Variables

```typescript
let timeseriesEmptyStateController: ReturnType<typeof createEmptyStateController> | null
```

## Functions

```typescript
function getTimeseriesEmptyStateController(): ReturnType<typeof createEmptyStateController>
```

```typescript
function computeRenderedYDebugSnapshot(): {
    selectedCols: string[];
    globalYMin: number | null;
    globalYMax: number | null;
    perSeries: Array<{ name: string; points: number; yMin: number | null; yMax: number | null }>;
} | null
```

```typescript
export function createTimeseriesPageController(deps: TimeseriesControllerDeps): {
    emitChartRangeChange: (sourceKind?: string) => void;
    fetchAndRender: () => Promise<void>;
    onZoomRangeChange: (newStart: number, newEnd: number, sourceKind?: string) => void;
    renderCurrentData: () => void;
}
```
