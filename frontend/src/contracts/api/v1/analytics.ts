import type { ExecutionIdentity } from './identity.js';

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
    estimator?: string;
    window?: string;
    detrend?: string;
    magnitude_units?: string;
    psd_units?: string;
    missing_count?: number;
}

export interface FftResponse {
    executionIdentity?: ExecutionIdentity;
    sample_count: number;
    sampling?: AnalysisSampling;
    results: FftResult[];
}

export interface AnalysisSampling {
    method: 'exact' | 'block_mean' | string;
    input_points: number;
    output_points: number;
    aggregation_factor: number;
    source_cadence_ms?: number | null;
    effective_cadence_ms?: number | null;
    source_start_ms?: number | null;
    source_end_ms?: number | null;
    analyzed_start_ms?: number | null;
    analyzed_end_ms?: number | null;
}

export interface SpectrogramResult {
    column: string;
    /** Original input cadence; `times_ms` is spaced by the STFT hop. */
    sample_rate_hz?: number;
    times_ms: number[];
    frequencies: number[];
    magnitudes: number[][];
}

export interface SpectrogramResponse {
    executionIdentity?: ExecutionIdentity;
    sample_count: number;
    sampling?: AnalysisSampling;
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
    executionIdentity?: ExecutionIdentity;
    sampling?: AnalysisSampling;
    sample_count?: number;
    columns: string[];
    tau_max: number;
    links: CausalLink[];
    graph: string[][][];
    val_matrix: number[][][];
    p_matrix: number[][][];
}

export interface CorrelationMatrixResponse {
    executionIdentity?: ExecutionIdentity;
    input_rows?: number;
    time_range_ms?: [number, number] | null;
    counts?: number[][];
    diff_counts?: number[][];
    columns: string[];
    pearson_raw?: (number | null)[][];
    spearman_raw?: (number | null)[][];
    kendall_raw?: (number | null)[][];
    pearson_diff?: (number | null)[][];
    spearman_diff?: (number | null)[][];
    kendall_diff?: (number | null)[][];
}

export interface SpectralFilterResponse {
    column: string;
    ts: number[];
    values: number[];
    filter_type: string;
    low_hz?: number;
    high_hz?: number;
}
