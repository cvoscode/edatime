# ai/frontend/src/bootstrap/analyticsOverlay.md
> Rolling-band computation, anomaly region fetching, and overlay render coordination.

## Functions
- `computeFrontendRollingBands(data: { ts?: Float64Array | number[]; series: Record<string, { x: Float64Array | number[]; y: Float64Array | number[] }> } | null, cols: string[], windowSize: number): RollingBandData[]`
  - Compute rolling mean with 1-sigma and 2-sigma bands for selected columns.
- `setAnomalyOverlayCallback(cb: () => void): void`
  - Wire ChartGPU overlay render callback so anomaly/rolling overlays trigger a re-render.
- `fetchAnomalyRegions(fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null, signal?: AbortSignal): Promise<void>`
  - Fetch anomaly regions from the backend and update appState.
- `computeAndSetRollingBands(windowSize: number): void`
  - Compute rolling bands from lastFetchedData plus column ranges; update appState.
- `cancelAnalyticsFetch(): void`
  - Stop any in-flight anomaly request.
- `isAnalyticsControllerActive(): boolean`
  - Whether an analytics fetch is currently in-flight.
