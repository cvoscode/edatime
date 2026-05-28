# ai/frontend/src/dataClient.ts
> Centralized application state and helper exports for the timeseries frontend.

## Exports (from sub-modules)

```typescript
export {
    chartState,
    analyticsState,
    uiState,
    datasetState,
    scatterState,
    runtimeState,
    store,
    appStateComposite as appState,
} from './store/index.js';

export { SERIES_COLORS } from './utils/seriesColors.js';

export {
    getDefaultProfileColumnWidths,
    PROFILE_COLUMNS,
    PROFILE_OVERSCAN,
    PROFILE_ROW_HEIGHT,
} from './services/profile/profile.js';
```

## Functions

```typescript
export function normalizeSeriesColor(value: unknown): string | null
export function getSeriesColor(column: string, fallbackIndex?: number): string
export function setSeriesColor(column: string, value: string): string | null
export function setMetaText(text: string): void
export function buildMetaBar(metadata: { total_rows?: number } | null): void
export function sanitizeSelectedColumns(): void
export function ensureRangeStateFromData(dataObj: DataObject): void
export function buildAdaptiveLineFiltersForQuery(): AdaptiveLineFilter[]
export function applyColumnRanges(dataObj: DataObject): FilteredDataObject
```

## Re-exports (from utils/format.js)

```typescript
export {
    formatAnalysisNumber,
    formatAnalysisTime,
    formatCount,
    formatProfileValue,
    formatToDatetimeLocal,
    isTemporalDtype,
    normalizeDtypeLabel,
    toFiniteNumberOrNull,
} from './utils/format.js';

export const computeBounds = computeBoundsImpl;
export const buildAdaptiveLineY = buildAdaptiveLineYImpl;
```