# timeseries.ts

Timeseries API client re-exports from analytics module.

## Re-exports

```typescript
function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method?: string,
    threshold?: number,
    signal?: AbortSignal,
): Promise<AnomalyResponse>

function fetchCausalGraph(
    columns: string[],
    tauMax?: number,
    alpha?: number,
    method?: string,
    maxPoints?: number,
    signal?: AbortSignal,
    pcAlpha?: number,
    test?: string,
    maxCondsDim?: number,
    fdrMethod?: string,
): Promise<CausalGraphResponse>

function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>

function fetchFft(
    start: string,
    end: string,
    columns: string,
    maxPoints?: number,
    signal?: AbortSignal,
): Promise<FftResponse>

function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window?: number,
    signal?: AbortSignal,
): Promise<RollingResponse>

function fetchSpectralFilter(
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<SpectralFilterResponse>

function postRemoveOutliers(
    columns: string[] | null,
    method?: string,
    threshold?: number,
    window?: number,
): Promise<OutlierRemovalResult>

function postTransform(
    expression: string,
    outputName: string,
): Promise<TransformResponse>
```
