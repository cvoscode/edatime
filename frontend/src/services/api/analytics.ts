import { getJson, postJson } from './http.js';

// ── Analytics ───────────────────────────────────────────────────────────────

// ── Rolling bands ──────────────────────────────────────────────────────────

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

export async function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window = 50,
    signal?: AbortSignal,
): Promise<RollingResponse> {
    const params = new URLSearchParams({ start, end, columns, window: String(window) });
    const url = `/api/analytics/rolling?${params.toString()}`;
    return getJson<RollingResponse>(url, 'Rolling bands', signal);
}

// ── Anomalies ───────────────────────────────────────────────────────────────

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

export async function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method = 'zscore',
    threshold?: number,
    signal?: AbortSignal,
): Promise<AnomalyResponse> {
    const params = new URLSearchParams({ start, end, columns, method });
    if (threshold !== undefined) params.set('threshold', String(threshold));
    const url = `/api/analytics/anomalies?${params.toString()}`;
    return getJson<AnomalyResponse>(url, 'Anomaly detection', signal);
}

// ── FFT ────────────────────────────────────────────────────────────────────

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
    /** Effective sampling rate (Hz) inferred from the timestamp column. */
    sample_rate_hz: number;
    /** Nyquist frequency = `sample_rate_hz / 2`. */
    nyquist_hz: number;
    /** Top detected spectral peaks sorted by magnitude. */
    dominant_peaks: FrequencyPeak[];
}

export interface FftResponse {
    sample_count: number;
    results: FftResult[];
}

export async function fetchFft(
    start: string,
    end: string,
    columns: string,
    maxPoints = 8192,
    signal?: AbortSignal,
): Promise<FftResponse> {
    const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
    const url = `/api/analytics/fft?${params.toString()}`;
    return getJson<FftResponse>(url, 'FFT', signal);
}

// ── Spectrogram (STFT) ─────────────────────────────────────────────────────

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
    /** `none` (default), `minmax`, `zscore`, or `robust`. */
    normalize?: string;
    /** `none`, `percentile`, or `iqr`. */
    clip?: string;
    /** Threshold for the active clip mode. */
    clipParam?: number;
}

export async function fetchSpectrogram(
    start: string,
    end: string,
    column: string,
    windowSize = 96,
    hopSize?: number,
    maxPoints = 32768,
    signal?: AbortSignal,
    scaleOptions?: SpectrogramScaleOptions,
): Promise<SpectrogramResponse> {
    const params = new URLSearchParams({
        start, end, column,
        window_size: String(windowSize),
        max_points: String(maxPoints),
    });
    if (hopSize != null) params.set('hop_size', String(hopSize));
    if (scaleOptions?.normalize) params.set('normalize', scaleOptions.normalize);
    if (scaleOptions?.clip) params.set('clip', scaleOptions.clip);
    if (scaleOptions?.clipParam != null && Number.isFinite(scaleOptions.clipParam)) {
        params.set('clip_param', String(scaleOptions.clipParam));
    }
    const url = `/api/analytics/spectrogram?${params.toString()}`;
    return getJson<SpectrogramResponse>(url, 'Spectrogram', signal);
}

// ── Causal Graph (Tigramite) ────────────────────────────────────────────────

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

export async function fetchCausalGraph(
    columns: string[],
    tauMax = 3,
    alpha = 0.05,
    method = 'pcmci',
    maxPoints = 5000,
    signal?: AbortSignal,
    pcAlpha = 0.2,
    test = 'par_corr',
    maxCondsDim?: number,
    fdrMethod = 'none',
): Promise<CausalGraphResponse> {
    const url = '/api/analytics/causal';
    const body: Record<string, unknown> = {
        columns: columns.join(','),
        tau_max: tauMax,
        alpha,
        method,
        max_points: maxPoints,
        pc_alpha: pcAlpha,
        test,
        fdr_method: fdrMethod,
    };
    if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
    return postJson<CausalGraphResponse>(url, body, 'Causal graph', signal);
}

// ── Transform ────────────────────────────────────────────────────────────────

export interface TransformResponse {
    status: string;
    column: string;
    expression: string;
}

export async function postTransform(
    expression: string,
    outputName: string,
): Promise<TransformResponse> {
    const url = '/api/transform';
    return postJson<TransformResponse>(url, { expression, output_name: outputName }, 'Transform');
}

// ── Correlation Matrix ───────────────────────────────────────────────────────

export interface CorrelationMatrixResponse {
    columns: string[];
    pearson?: (number | null)[][];
    spearman?: (number | null)[][];
    pearson_raw?: (number | null)[][];
    spearman_raw?: (number | null)[][];
    kendall_raw?: (number | null)[][];
    pearson_diff?: (number | null)[][];
    spearman_diff?: (number | null)[][];
    kendall_diff?: (number | null)[][];
}

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    return getJson<CorrelationMatrixResponse>('/api/scatter/correlations/matrix', 'Correlation matrix');
}

// ── Outlier Removal ─────────────────────────────────────────────────────────

export interface OutlierRemovalResult {
    method: string;
    columns: string[];
    rows_before: number;
    rows_after: number;
    rows_removed: number;
}

export async function postRemoveOutliers(
    columns: string[] | null,
    method = 'zscore',
    threshold?: number,
    window?: number,
): Promise<OutlierRemovalResult> {
    const body: Record<string, unknown> = { method };
    if (columns) body.columns = columns.join(',');
    if (threshold !== undefined) body.threshold = threshold;
    if (window !== undefined) body.window = window;

    const url = '/api/analytics/remove_outliers';
    return postJson<OutlierRemovalResult>(url, body, 'Outlier removal');
}

// ── Spectral Filter ─────────────────────────────────────────────────────────

export interface SpectralFilterResponse {
    column: string;
    ts: number[];
    values: number[];
    filter_type: string;
    low_hz?: number;
    high_hz?: number;
}

export async function fetchSpectralFilter(params: URLSearchParams, signal?: AbortSignal): Promise<SpectralFilterResponse> {
    return getJson<SpectralFilterResponse>(`/api/analytics/spectral-filter?${params.toString()}`, 'Spectral filter', signal);
}
