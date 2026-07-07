# ai/frontend/src/types.md
> Shared TypeScript interfaces consumed across the frontend; this mirror highlights the cross-cutting types changed by the current refactor.

## FetchedWindow
- `start: number`
- `end: number`

## SummaryStats
- `mean: number`
- `std: number`
- `min: number`
- `max: number`

## TopPairItem
- `x: string`
- `y: string`
- `correlation: number`
- `count: number`

## ScatterPairStats
- `pearsonRaw: number | null`
- `spearmanRaw: number | null`
- `pearsonDiff: number | null`
- `spearmanDiff: number | null`
- `count: number | null`

## AppStateType
- Includes `fetchedWindow: FetchedWindow | null`, `anomalyGlobalEnabled: boolean`, and `anomalySummaryStats: SummaryStats | null` in addition to the existing chart, dataset, UI, and scatter fields.

## RollingBandData
- `column: string`
- `color?: string`
- `ts: number[]`
- `mean: (number | null)[]`
- `upper1: (number | null)[]`
- `lower1: (number | null)[]`
- `upper2: (number | null)[]`
- `lower2: (number | null)[]`

## AnomalyResponse
- `method: string`
- `threshold: number`
- `regions: AnomalyRegionData[]`
- `summary_stats?: SummaryStats | null`

## ScatterState
- Includes `correlationsByColumn: Map<string, { value?: number | null; count?: number; column?: string }>` and `currentPairStats: ScatterPairStats | null` alongside the existing scatter page state.
