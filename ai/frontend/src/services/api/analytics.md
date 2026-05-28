# analytics.ts

Analytics API client for time series analysis operations.

## Functions

```typescript
function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window?: number,
    signal?: AbortSignal,
): Promise<RollingResponse>

function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method?: string,
    threshold?: number,
    signal?: AbortSignal,
): Promise<AnomalyResponse>

function fetchFft(
    start: string,
    end: string,
    columns: string,
    maxPoints?: number,
    signal?: AbortSignal,
): Promise<FftResponse>

function fetchSpectrogram(
    start: string,
    end: string,
    column: string,
    windowSize?: number,
    hopSize?: number,
    maxPoints?: number,
    signal?: AbortSignal,
): Promise<SpectrogramResponse>

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

function postTransform(
    expression: string,
    outputName: string,
): Promise<TransformResponse>

function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse>

function postRemoveOutliers(
    columns: string[] | null,
    method?: string,
    threshold?: number,
    window?: number,
): Promise<OutlierRemovalResult>

function fetchSpectralFilter(
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<SpectralFilterResponse>
```

## Types

```typescript
interface RollingBand {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

interface RollingResponse {
    bands: RollingBand[];
}

interface AnomalyRegion {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

interface AnomalyResponse {
    method: string;
    threshold: number;
    regions: AnomalyRegion[];
}

interface FftResult {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
}

interface FftResponse {
    sample_count: number;
    results: FftResult[];
}

interface SpectrogramResult {
    column: string;
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
}

interface SpectrogramResponse {
    sample_count: number;
    result: SpectrogramResult;
}

interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

interface CausalGraphResponse {
    columns: string[];
    tau_max: number;
    links: CausalLink[];
    graph: string[][][];
    val_matrix: number[][][];
    p_matrix: number[][][];
}

interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}

interface CorrelationMatrixResponse {
    columns: string[];
    pearson: (number | null)[][];
    spearman: (number | null)[][];
}

interface OutlierRemovalResult {
    method: string;
    columns: string[];
    rows_before: number;
    rows_after: number;
    rows_removed: number;
}

interface SpectralFilterResponse {
    column: string;
    ts: number[];
    values: number[];
    filter_type: string;
    low_hz?: number;
    high_hz?: number;
}
```
