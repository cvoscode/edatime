# ai/frontend/src/types/api.md
> Re-exports API response and metadata type definitions.

## Re-exports
- `AnomalyResponse` [deps: [types.ts][1]]
- `ColumnMetadata` [deps: [types.ts][1]]
- `ColumnProfile` [deps: [types.ts][1]]
- `CorrelationItem` [deps: [types.ts][1]]
- `CorrelationSuggestion` [deps: [types.ts][1]] — `{ x: string; y: string; correlation: number }` shape returned by `GET /api/v1/scatter/correlations`. Replaces the older single-column suggestion shape.
- `DataFetchMeta` [deps: [types.ts][1]]
- `DataObject` [deps: [types.ts][1]]
- `DatasetMetadata` [deps: [types.ts][1]]
- `Histogram` [deps: [types.ts][1]]
- `ScatterCorrelationsResponse` [deps: [types.ts][1]] — `suggestions` field is now `CorrelationSuggestion[]` (was `CorrelationItem[]`).
- `ScatterFetchOptions` [deps: [types.ts][1]]
- `ScatterFilterSpec` [deps: [types.ts][1]]
- `ScatterLineFilterSpec` [deps: [types.ts][1]]
- `ScatterPointsResponse` [deps: [types.ts][1]]
- `TimeRange` [deps: [types.ts][1]]
- `TransformResponse` [deps: [types.ts][1]]

---
[1]: ../../src/types.ts
