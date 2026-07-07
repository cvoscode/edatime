# ai/frontend/src/store/scatterState.md
> Canonical scatter-page state, including matrix batch caching and per-view filter snapshots.

## Interfaces
- `ScatterView`
  - `{ xMin: number; xMax: number; yMin: number; yMax: number }`
- `ScatterDrag`
  - `{ pointerId: number; startX: number; endX: number; startY: number; endY: number }`
- `DensityTooltipMeta`
  - `{ colorCenter: number; colorLo: number; colorHi: number }`
- `DensityTooltipCache`
  - `{ key: string; binSize: number; metrics: { plotWidth: number; plotHeight: number; devicePixelRatio: number; plotLeftPx: number; plotTopPx: number; plotRightPx: number; plotBottomPx: number; exactLeftPx: number; exactTopPx: number; exactRightPx: number; exactBottomPx: number; binSizePx: number; binSizeCss: number; binCountX: number; binCountY: number } | null; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, DensityTooltipMeta>; marginalCountsX: number[] | null; marginalCountsY: number[] | null }`
- `MatrixCellData`
  - `{ totalPoints: number; points: [number, number][]; colorValues?: number[] | null; colorLabels?: (string | null)[] | null }`
- `ScatterFetchOptions`
  - `{ start?: number; end?: number; filters?: ScatterFilterSpec[]; lineFilters?: ScatterLineFilterSpec[] }`
- `ScatterFilterSnapshot`
  - `{ columnRanges: Record<string, { from: number; to: number }>; lineFilters: ScatterLineFilterSpec[] }`
- `ScatterState`
  - Includes metadata, point/color buffers, color cardinality, `correlationsByColumn`, `currentPairStats`, active/full/view ranges, zoom history, render-signature/cache keys, matrix caches, and per-view filter snapshots.

## Exports
- `scatterState: ScatterState`
- `getScatterViewSnapshot(view: 'plot' | 'matrix'): ScatterFilterSnapshot`
- `setScatterViewSnapshot(view: 'plot' | 'matrix', snapshot: ScatterFilterSnapshot): void`
- `clearScatterViewSnapshots(): void`
- `setScatterChart(chart: ChartGPUInstance | null): void`
- `setScatterInitialized(v: boolean): void`
- `setScatterPageInitialized(v: boolean): void`
- `setScatterView(view: ScatterView): void`
- `setScatterActiveView(view: string): void`
- `setScatterPoints(allPoints: [number, number][], points: [number, number][]): void`
- `setScatterColorState(colorColumn: string, allColorValues: number[] | null, allColorLabels: (string | null)[] | null, colorValues: number[] | null, colorLabels: (string | null)[] | null, colorMin: number | null, colorMax: number | null): void`
- `setScatterMetadata(metadata: DatasetMetadata | null): void`
- `setScatterLoading(v: boolean): void`
- `setScatterTotalPoints(n: number): void`
- `replaceScatterState(next: Partial<ScatterState>): void`
