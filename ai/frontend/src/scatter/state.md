# state.ts

Scatter plot state management: controls readers, query builders, view utilities, and state re-exports.

## Interfaces

```typescript
interface ScatterControls {
    x: string;
    y: string;
    binSize: number;
    colormap: string;
    normalization: string;
    renderMode: string;
    diagonalMode: string;
    colorColumn: string;
    selectedColorColumn: string;
    colorScale: string;
    matrixMode: string;
    matrixCellSize: number;
}

interface ScatterQueryContext {
    start?: number;
    end?: number;
    filters: Array<{ column: string; from: number; to: number }>;
    lineFilters: ReturnType<typeof buildAdaptiveLineFiltersForQuery>;
}
```

## Type Aliases

```typescript
type ScatterView = { xMin: number; xMax: number; yMin: number; yMax: number }
type ScatterDrag = { pointerId: number; startX: number; endX: number; startY: number; endY: number }
type DensityTooltipMeta = { colorCenter: number; colorLo: number; colorHi: number }
type DensityTooltipCache = { key: string; binSize: number; metrics: any; binsBySeriesIndex: Map<number, Map<string, number>>; metaBySeriesIndex: Map<number, any> }
type MatrixCellData = { totalPoints: number; points: [number, number][]; colorValues: number[] | null; colorLabels: string[] | null }
```

## Functions

```typescript
function currentControls(): ScatterControls
function isLinkedBrushEnabled(): boolean
function buildScatterQueryContext(columns?: { x?: string; y?: string; colorColumn?: string }): ScatterQueryContext
function getActiveScatterFilterColumns(columns?: { x?: string; y?: string; colorColumn?: string }): string[]
function buildRenderSignature(controls: ScatterControls): string
function buildOverviewContextKey(context: Partial<ScatterQueryContext>): string
function clampView(view: ScatterView): ScatterView
function applyScatterStateFromCache(resetView?: boolean): void
function setStats(partial: Record<string, string | number | null | undefined>): void
function getPlotMetrics(container: HTMLElement | null): { width: number; height: number; grid: any; plotLeft: number; plotRight: number; plotTop: number; plotBottom: number; plotWidth: number; plotHeight: number } | null
function getProfileForColumn(column: string): any
function getProfileHistogram(column: string): { min: number; max: number; counts: number[]; edges: number[] } | null
function getCurrentScatterValues(column: string): number[]
function normalizeAnalyticsView(viewName: string): string
function disposeScatterChart(resetSignature?: boolean): void
function resetScatterContainer(): HTMLElement | null
function ensureOptions(selectEl: HTMLSelectElement | null, values: string[], preferredValue?: string): string | null
```

## Re-exports

```typescript
// From ../state.js:
appState

// From ../store/index.js:
state, scatterState

// From ./helpers.js:
getEl, fmt, computeColorExtent, computeDomains, normalizeCategoryLabel, normalizeColorValues, buildCategoricalColorGroups, CategoricalColorGroups
```
