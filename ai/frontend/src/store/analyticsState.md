# ai/frontend/src/store/analyticsState.md
> Analytics sub-state for rolling overlays, anomaly overlays, and spectral previews.

## Interfaces
- `RollingBandData`
  - `{ column: string; color?: string; ts: number[]; mean: (number | null)[]; upper1: (number | null)[]; lower1: (number | null)[]; upper2: (number | null)[]; lower2: (number | null)[] }`
- `AnomalyRegionData`
  - `{ column: string; method: string; start_ms: number; end_ms: number; score: number }`
- `SummaryStats`
  - `{ mean: number; std: number; min: number; max: number }`
- `SpectralFilterPreview`
  - `{ column: string; ts: number[]; values: number[]; filterType: string; lowHz?: number; highHz?: number }`
- `AnalyticsState`
  - `{ rollingEnabled: boolean; rollingWindow: number; rollingBands: RollingBandData[] | null; anomalyEnabled: boolean; anomalyGlobalEnabled: boolean; anomalyMethod: string; anomalyThreshold: number; anomalyRegions: AnomalyRegionData[] | null; anomalySummaryStats: SummaryStats | null; spectralFilterPreview: SpectralFilterPreview | null }`

## Exports
- `analyticsState: AnalyticsState`
- `setRollingEnabled(v: boolean): void`
- `setRollingWindow(n: number): void`
- `setRollingBands(bands: RollingBandData[] | null): void`
- `setAnomalyEnabled(v: boolean): void`
- `setAnomalyGlobalEnabled(v: boolean): void`
- `setAnomalyMethod(m: string): void`
- `setAnomalyThreshold(t: number): void`
- `setAnomalyRegions(regions: AnomalyRegionData[] | null): void`
- `setAnomalySummaryStats(stats: SummaryStats | null): void`
- `setSpectralFilterPreview(preview: SpectralFilterPreview | null): void`
