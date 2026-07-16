import { postJson } from './http.js';
import type { ApiRequestOptions } from './http.js';
import { apiV1Routes } from '../../contracts/api/v1/routes.js';
import { cleaningPlanStore } from '../../cleaning/store.js';
import { buildPlanRequestSnapshot } from '../../cleaning/compiler.js';
import type {
    AnomalyResponse,
    CausalGraphResponse,
    CorrelationMatrixResponse,
    FftResponse,
    RollingResponse,
    SpectralFilterResponse,
    SpectrogramResponse,
    SpectrogramScaleOptions,
} from '../../contracts/api/v1/analytics.js';

function activeCleaningPlan(): ReturnType<typeof buildPlanRequestSnapshot> {
    const plan = cleaningPlanStore.getSnapshot();
    if (!plan) throw new Error('Analytics requests require an active cleaning plan');
    return buildPlanRequestSnapshot(plan);
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
    CorrelationMatrixResponse,
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
    return postJson<RollingResponse>(apiV1Routes.analytics.rolling, {
        start, end, columns, window, cleaning_plan: plan,
    }, 'Rolling bands', options);
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
    return postJson<AnomalyResponse>(apiV1Routes.analytics.anomalies, {
        start, end, columns, method, threshold, cleaning_plan: plan,
    }, 'Anomaly detection', options);
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
    return postJson<FftResponse>(apiV1Routes.analytics.fft, {
        start, end, columns, max_points: maxPoints, cleaning_plan: plan,
    }, 'FFT', options);
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
    return postJson<SpectrogramResponse>(apiV1Routes.analytics.spectrogram, {
        start, end, column,
        window_size: windowSize,
        hop_size: hopSize,
        max_points: maxPoints,
        normalize: scaleOptions?.normalize,
        clip: scaleOptions?.clip,
        clip_param: Number.isFinite(scaleOptions?.clipParam) ? scaleOptions?.clipParam : undefined,
        cleaning_plan: plan,
    }, 'Spectrogram', options);
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
    body.cleaning_plan = activeCleaningPlan();
    if (maxCondsDim != null) body.max_conds_dim = maxCondsDim;
    return postJson<CausalGraphResponse>(url, body, 'Causal graph', options);
}

// ── Correlation Matrix ───────────────────────────────────────────────────────

export async function fetchCorrelationMatrix(): Promise<CorrelationMatrixResponse> {
    const plan = activeCleaningPlan();
    return postJson<CorrelationMatrixResponse>(
        apiV1Routes.scatter.correlationMatrix,
        { cleaning_plan: plan },
        'Correlation matrix',
    );
}

// ── Spectral Filter ─────────────────────────────────────────────────────────

export async function fetchSpectralFilter(
    params: URLSearchParams,
    options?: ApiRequestOptions,
): Promise<SpectralFilterResponse> {
    const query = new URLSearchParams(params);
    const plan = activeCleaningPlan();
    const body: Record<string, unknown> = Object.fromEntries(query.entries());
    for (const key of ['low_hz', 'high_hz', 'sample_rate_hz', 'max_points']) {
        if (body[key] !== undefined) body[key] = Number(body[key]);
    }
    body.cleaning_plan = plan;
    return postJson<SpectralFilterResponse>(
        apiV1Routes.analytics.spectralFilter,
        body,
        'Spectral filter',
        options,
    );
}
