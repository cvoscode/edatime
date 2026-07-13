/** JSON request/response DTOs for versioned analysis routes. */
export interface RollingBand {
    column: string;
    ts: number[];
    mean: (number | null)[];
    upper1: (number | null)[];
    lower1: (number | null)[];
    upper2: (number | null)[];
    lower2: (number | null)[];
}

export interface RollingResponse {
    bands: RollingBand[];
}

export interface AnomalyRegion {
    column: string;
    method: string;
    start_ms: number;
    end_ms: number;
    score: number;
}

export interface SummaryStats {
    mean: number;
    std: number;
    min: number;
    max: number;
}

export interface AnomalyResponse {
    method: string;
    threshold: number;
    regions: AnomalyRegion[];
    summary_stats?: SummaryStats | null;
}

export interface FrequencyPeak {
    frequency_hz: number;
    magnitude: number;
    power: number;
    rank: number;
}

export interface FftResult {
    column: string;
    frequencies: number[];
    magnitudes: number[];
    psd: number[];
    sample_rate_hz: number;
    nyquist_hz: number;
    dominant_peaks: FrequencyPeak[];
}

export interface FftResponse {
    sample_count: number;
    results: FftResult[];
}

export interface SpectrogramResult {
    column: string;
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
}

export interface SpectrogramResponse {
    sample_count: number;
    result: SpectrogramResult;
}

export interface SpectrogramScaleOptions {
    normalize?: string;
    clip?: string;
    clipParam?: number;
}

export interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

export interface CausalGraphResponse {
    columns: string[];
    tau_max: number;
    links: CausalLink[];
    graph: string[][][];
    val_matrix: number[][][];
    p_matrix: number[][][];
}

export interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}

export interface CorrelationMatrixResponse {
    columns: string[];
    pearson_raw?: (number | null)[][];
    spearman_raw?: (number | null)[][];
    kendall_raw?: (number | null)[][];
    pearson_diff?: (number | null)[][];
    spearman_diff?: (number | null)[][];
    kendall_diff?: (number | null)[][];
}

export interface OutlierRemovalResult {
    method: string;
    columns: string[];
    rows_before: number;
    rows_after: number;
    rows_removed: number;
}

export interface SpectralFilterResponse {
    column: string;
    ts: number[];
    values: number[];
    filter_type: string;
    low_hz?: number;
    high_hz?: number;
}
