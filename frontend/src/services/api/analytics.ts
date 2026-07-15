import { getJson, postJson } from './http.js';
import type { ApiRequestOptions } from './http.js';
import { apiV1Routes, withApiQuery } from '../../contracts/api/v1/routes.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';
import type {
    AnomalyResponse,
    CausalGraphResponse,
    CorrelationMatrixResponse,
    FftResponse,
    OutlierRemovalResult,
    RollingResponse,
    SpectralFilterResponse,
    SpectrogramResponse,
    SpectrogramScaleOptions,
    TransformResponse,
} from '../../contracts/api/v1/analytics.js';

function appendCleaningPlan(params: URLSearchParams): void {
    const plan = activeCleaningPlan();
    if (plan) params.set('cleaning_plan', JSON.stringify(plan));
}

function activeCleaningPlan(): ReturnType<typeof buildPlanRequestSnapshot> | null {
    const plan = cleaningPlanStore.getSnapshot();
    return plan?.stages.some((stage) => stage.enabled)
        ? buildPlanRequestSnapshot(plan)
        : null;
}

export type {
    RollingBand,
    RollingResponse,
    AnomalyRegion,
    AnomalyResponse,
    FrequencyPeak,
    FftResult,
    FftResponse,
    SpectrogramResult,
    SpectrogramResponse,
    SpectrogramScaleOptions,
    CausalLink,
    CausalGraphResponse,
    TransformResponse,
    CorrelationMatrixResponse,
    OutlierRemovalResult,
    SpectralFilterResponse,
} from '../../contracts/api/v1/analytics.js';

// ── Analytics ───────────────────────────────────────────────────────────────

// ── Rolling bands ──────────────────────────────────────────────────────────

export async function fetchRollingBands(
    start: string,
    end: string,
    columns: string,
    window = 50,
    options?: ApiRequestOptions,
): Promise<RollingResponse> {
    const plan = activeCleaningPlan();
    if (plan) {
        return postJson<RollingResponse>(apiV1Routes.analytics.rolling, {
            start, end, columns, window, cleaning_plan: plan,
        }, 'Rolling bands', options);
    }
    const params = new URLSearchParams({ start, end, columns, window: String(window) });
    appendCleaningPlan(params);
    const url = withApiQuery(apiV1Routes.analytics.rolling, params);
    return getJson<RollingResponse>(url, 'Rolling bands', options);
}

// ── Anomalies ───────────────────────────────────────────────────────────────

export async function fetchAnomalies(
    start: string,
    end: string,
    columns: string,
    method = 'zscore',
    threshold?: number,
    options?: ApiRequestOptions,
): Promise<AnomalyResponse> {
    const plan = activeCleaningPlan();
    if (plan) {
        return postJson<AnomalyResponse>(apiV1Routes.analytics.anomalies, {
            start, end, columns, method, threshold, cleaning_plan: plan,
        }, 'Anomaly detection', options);
    }
    const params = new URLSearchParams({ start, end, columns, method });
    if (threshold !== undefined) params.set('threshold', String(threshold));
    appendCleaningPlan(params);
    const url = withApiQuery(apiV1Routes.analytics.anomalies, params);
    return getJson<AnomalyResponse>(url, 'Anomaly detection', options);
}

// ── FFT ────────────────────────────────────────────────────────────────────

export async function fetchFft(
    start: string,
    end: string,
    columns: string,
    maxPoints = 8192,
    options?: ApiRequestOptions,
): Promise<FftResponse> {
    const plan = activeCleaningPlan();
    if (plan) {
        return postJson<FftResponse>(apiV1Routes.analytics.fft, {
            start, end, columns, max_points: maxPoints, cleaning_plan: plan,
        }, 'FFT', options);
    }
    const params = new URLSearchParams({ start, end, columns, max_points: String(maxPoints) });
    appendCleaningPlan(params);
    const url = withApiQuery(apiV1Routes.analytics.fft, params);
    return getJson<FftResponse>(url, 'FFT', options);
}

// ── Spectrogram (STFT) ─────────────────────────────────────────────────────

export async function fetchSpectrogram(
    start: string,
    end: string,
    column: string,
    windowSize = 96,
    hopSize?: number,
    maxPoints = 32768,
    options?: ApiRequestOptions,
    scaleOptions?: SpectrogramScaleOptions,
): Promise<SpectrogramResponse> {
    const plan = activeCleaningPlan();
    if (plan) {
        return postJson<SpectrogramResponse>(apiV1Routes.analytics.spectrogram, {
            start, end, column,
            window_size: windowSize,
            hop_size: hopSize,
            max_points: maxPoints,
            normalize: scaleOptions?.normalize,
            clip: scaleOptions?.clip,
            clip_param: scaleOptions?.clipParam,
            cleaning_plan: plan,
        }, 'Spectrogram', options);
    }
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
    appendCleaningPlan(params);
    const url = withApiQuery(apiV1Routes.analytics.spectrogram, params);
    return getJson<SpectrogramResponse>(url, 'Spectrogram', options);
}

// ── Causal Graph (Tigramite) ────────────────────────────────────────────────

export async function fetchCausalGraph(
    columns: string[],
    tauMax = 3,
    alpha = 0.05,
    method = 'pcmci',
    maxPoints = 5000,
    options?: ApiRequestOptions,
    pcAlpha = 0.2,
    test = 'par_corr',
    maxCondsDim?: number,
    fdrMethod = 'none',
): Promise<CausalGraphResponse> {
    const url = apiV1Routes.analytics.causal;
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
    const plan = cleaningPlanStore.getSnapshot();
    if (plan?.stages.some((stage) => stage.enabled)) body.cleaning_plan = buildPlanRequestSnapshot(plan);
    if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
    return postJson<CausalGraphResponse>(url, body, 'Causal graph', options);
}

// ── Transform ────────────────────────────────────────────────────────────────

export async function postTransform(
    expression: string,
    outputName: string,
): Promise<TransformResponse> {
    const url = apiV1Routes.transform;
    return postJson<TransformResponse>(url, { expression, output_name: outputName }, 'Transform');
}

// ── Correlation Matrix ───────────────────────────────────────────────────────

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    const params = new URLSearchParams();
    appendCleaningPlan(params);
    const url = params.size > 0
        ? withApiQuery(apiV1Routes.scatter.correlationMatrix, params)
        : apiV1Routes.scatter.correlationMatrix;
    return getJson<CorrelationMatrixResponse>(url, 'Correlation matrix');
}

// ── Outlier Removal ─────────────────────────────────────────────────────────

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

    const url = apiV1Routes.analytics.removeOutliers;
    return postJson<OutlierRemovalResult>(url, body, 'Outlier removal');
}

// ── Spectral Filter ─────────────────────────────────────────────────────────

export async function fetchSpectralFilter(
    params: URLSearchParams,
    options?: ApiRequestOptions,
): Promise<SpectralFilterResponse> {
    const query = new URLSearchParams(params);
    appendCleaningPlan(query);
    return getJson<SpectralFilterResponse>(
        withApiQuery(apiV1Routes.analytics.spectralFilter, query),
        'Spectral filter',
        options,
    );
}
