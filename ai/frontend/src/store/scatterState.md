# ai/frontend/src/store/scatterState.md
> Canonical scatter state holder. The shape of every scatter-page state field lives here. Shared interfaces (`ScatterView`, `ScatterDrag`, `DensityTooltipMeta`, `DensityTooltipCache`) are now defined in [../types.md](../types.md) so consumers stay in sync.

## Interfaces
```ts
interface ScatterView {
    xMin: number; xMax: number; yMin: number; yMax: number;
}

interface ScatterDrag {
    pointerId: number; startX: number; endX: number; startY: number; endY: number;
}

interface DensityTooltipMeta {
    colorCenter: number; colorLo: number; colorHi: number;
}

interface DensityTooltipCache {
    key: string;
    binSize: number;
    metrics: {
        plotWidth: number;
        plotHeight: number;
        devicePixelRatio: number;
        plotLeftPx: number;
        plotTopPx: number;
        plotRightPx: number;
        plotBottomPx: number;
        exactLeftPx: number;
        exactTopPx: number;
        exactRightPx: number;
        exactBottomPx: number;
        binSizePx: number;
        binSizeCss: number;
        binCountX: number;
        binCountY: number;
    } | null;
    binsBySeriesIndex: Map<number, Map<string, number>>;
    metaBySeriesIndex: Map<number, DensityTooltipMeta>;
    marginalCountsX: number[] | null;
    marginalCountsY: number[] | null;
}

interface ScatterState {
    activeView: 'plot' | 'matrix';
    loading: boolean;
    points: Array<[number, number]>;
    colorValues: number[] | null;
    colorLabels: Array<string | null> | null;
    allPoints: Array<[number, number]>;
    allColorValues: number[] | null;
    allColorLabels: Array<string | null> | null;
    colorColumn: string;
    totalPoints: number;
    chart: any;
    lastOptionSeries: any[] | null;
    zoomHistory: ScatterView[];
    view: ScatterView;
    full: ScatterView;
    colorMin: number | null;
    colorMax: number | null;
    selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
    drag: ScatterDrag | null;
    densityTooltipCache: DensityTooltipCache | null;
    suggestionThreshold: number;
    lastPerformanceMs: number;
    lastUpdateMs: number;
    correlationsByColumn: Map<string, any>;
    metadata: DatasetMetadata | null;
    columnTypes: Map<string, string>;
    lastSuggestions: Array<{ x: string; y: string; correlation: number }>;
    lastRenderSignature: string;
    lastQueryContextKey: string;
    matrixCache: Map<string, Promise<MatrixCellData>>;
    matrixColumnOrder: string[];
    overviewRequestId: number;
    scatterRequestId: number;
    initialized: boolean;
    pageInitialized: boolean;
}
```

## Constants
- `scatterState: ScatterState` — module-scoped singleton instance. Initialized with empty maps/arrays, default `suggestionThreshold = 0.7`, and `lastQueryContextKey = ''`.

## Notable Fields
- `lastQueryContextKey` — stringified snapshot of the last scatter query context (filters + line filters + linked time range). The page-change handler uses it to skip redundant re-renders when neither the view nor the query context has changed.
- `metrics` inside `DensityTooltipCache` — pixel-precise binning metrics that account for `devicePixelRatio`. `exactLeftPx` / `exactTopPx` etc. are the unrounded grid positions; `plotLeftPx` / `plotRightPx` are the `floor` / `ceil` versions used for membership checks. `binCountX` / `binCountY` are precomputed so the binner does not need to recompute them per point.
- `lastRenderSignature` — opaque string built by [state.ts:buildRenderSignature][1]; includes the current `view` so density-mode zoom forces a chart re-create.

---
[1]: ../scatter/state.md#buildRenderSignature
