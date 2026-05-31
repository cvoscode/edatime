# frontend/src/bootstrap/analyticsOverlay.ts
> Rolling-band computation, anomaly region fetching, and overlay render coordination.

## Interface: RollingBandData
```typescript
interface RollingBandData {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}
```

## Functions

### computeFrontendRollingBands
- `computeFrontendRollingBands(data: { ts?: Float64Array | number[]; series: Record<string, { x: Float64Array | number[]; y: Float64Array | number[] }> } | null, cols: string[], windowSize: number): RollingBandData[]`
  - Computes rolling mean ± 1σ / 2σ bands for selected columns using a symmetric sliding window.

### setAnomalyOverlayCallback
- `setAnomalyOverlayCallback(cb: () => void): void`
  - Wires ChartGPU's overlay render callback so anomaly/rolling overlays trigger a re-render.

### fetchAnomalyRegions
- `fetchAnomalyRegions(fetchAnomalies: ((start: string, end: string, columns: string, method?: string, threshold?: number, signal?: AbortSignal) => Promise<AnomalyResponse>) | null, signal?: AbortSignal): Promise<void>`
  - Fetches anomaly regions from backend and updates `appState.anomalyRegions`. Returns early if current time range is not finite.

### computeAndSetRollingBands
- `computeAndSetRollingBands(windowSize: number): void`
  - Applies column filters to `lastFetchedData`, computes rolling bands, and updates `appState.rollingBands`.

### cancelAnalyticsFetch
- `cancelAnalyticsFetch(): void`
  - Aborts any in-flight anomaly request.

### isAnalyticsControllerActive
- `isAnalyticsControllerActive(): boolean`
  - Returns whether an analytics fetch is currently in-flight.

---
[1]: ../store/index.md
[2]: ../services/timeseries/filtering.md
[3]: ../types.md
[4]: ../store/appStateCompat.md
