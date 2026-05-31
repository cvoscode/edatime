# frontend/src/store/analyticsState.ts
> Rolling bands, anomaly regions, spectral filter preview.

## Interfaces

### `RollingBandData`
- `column: string`
- `ts: number[]`
- `mean: (number | null)[]`
- `upper1`, `lower1: (number | null)[]` — ±1σ
- `upper2`, `lower2: (number | null)[]` — ±2σ

### `AnomalyRegionData`
- `column: string`
- `method: string`
- `start_ms: number`, `end_ms: number`
- `score: number`

### `SpectralFilterPreview`
- `column: string`
- `ts: number[]`, `values: number[]`
- `filterType: string`
- `lowHz?: number`, `highHz?: number`

### `AnalyticsState`
- `rollingEnabled: boolean`
- `rollingWindow: number`
- `rollingBands: RollingBandData[] | null`
- `anomalyEnabled: boolean`
- `anomalyMethod: string`
- `anomalyThreshold: number`
- `anomalyRegions: AnomalyRegionData[] | null`
- `spectralFilterPreview: SpectralFilterPreview | null`

## Exports
- `analyticsState: AnalyticsState`
- `setRollingEnabled(v: boolean): void`
- `setRollingWindow(n: number): void`
- `setRollingBands(bands: RollingBandData[] | null): void`
- `setAnomalyEnabled(v: boolean): void`
- `setAnomalyMethod(m: string): void`
- `setAnomalyThreshold(t: number): void`
- `setAnomalyRegions(regions: AnomalyRegionData[] | null): void`
- `setSpectralFilterPreview(preview: SpectralFilterPreview | null): void`

---
[1]: events.md