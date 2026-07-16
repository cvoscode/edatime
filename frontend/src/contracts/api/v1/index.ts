/** Public TypeScript surface for the current versioned API contract. */
export { apiV1Routes, withApiQuery } from './routes.js';
export type {
    ColumnMetadata,
    TimeRange,
    Histogram,
    ColumnProfile,
    DatasetMetadata,
    DatasetProfileResponse,
} from './dataset.js';
export type {
    RollingBand,
    RollingResponse,
    AnomalyRegion,
    SummaryStats,
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
} from './analytics.js';
export { CORRELATION_METRICS } from './scatter.js';
export type {
    CorrelationMetric,
    ColorCardinality,
    ScatterPointsResponse,
    ScatterMatrixPair,
    CorrelationItem,
    CorrelationSuggestion,
    TopPairItem,
    ScatterCorrelationsResponse,
} from './scatter.js';
