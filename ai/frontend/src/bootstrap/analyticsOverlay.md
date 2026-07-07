# ai/frontend/src/bootstrap/analyticsOverlay.md
> Rolling-band computation, anomaly-region fetching, and overlay render coordination for the timeseries chart.

## Interface `RollingBandData`
- `column: string`
- `color?: string`
- `ts: number[]`
- `mean: (number | null)[]`
- `upper1: (number | null)[]`
- `lower1: (number | null)[]`
- `upper2: (number | null)[]`
- `lower2: (number | null)[]`

## Functions
- `computeFrontendRollingBands(data: { ts?: Float64Array | number[]; series: Record<string, { x: Float64Array | number[]; y: Float64Array | number[] }> } | null, cols: string[], windowSize: number): RollingBandData[]`
  - Computes rolling mean ±1σ / ±2σ bands and stamps each band with the series color.
- `setAnomalyOverlayCallback(cb: () => void): void`
- `fetchAnomalyRegions(fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null, signal?: AbortSignal): Promise<void>`
  - Fetches anomaly regions for the current chart range and updates both `analyticsState.anomalyRegions` and `analyticsState.anomalySummaryStats`.
- `computeAndSetRollingBands(windowSize: number): void`
- `cancelAnalyticsFetch(): void`
- `isAnalyticsControllerActive(): boolean`
- `initAnalyticsListeners(fetchAndRenderAnalytics: () => Promise<void>): () => void`
- `fetchAndRenderAnalytics(fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null): Promise<void>`
