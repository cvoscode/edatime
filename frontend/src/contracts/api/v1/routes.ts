/**
 * Canonical public paths for the versioned HTTP API.
 *
 * Route-family clients may add query parameters, but must derive their base
 * path here. Keeping that identity separate from request execution lets the
 * contract be checked without coupling it to fetch, Arrow decoding, or DOM
 * concerns.
 */
export const apiV1Routes = {
    metadata: '/api/v1/metadata',
    data: '/api/v1/data',
    sample: (name: string): string => `/api/v1/sample/${encodeURIComponent(name)}`,
    exportParquet: '/api/v1/export/parquet',
    jobs: '/api/v1/jobs',
    job: (id: string): string => `/api/v1/jobs/${encodeURIComponent(id)}`,
    cleaning: {
        validate: '/api/v1/cleaning/validate',
        preview: '/api/v1/cleaning/preview',
        apply: '/api/v1/cleaning/apply',
        exportData: '/api/v1/cleaning/export/data',
        exportPlan: '/api/v1/cleaning/export/plan',
        versions: '/api/v1/datasets/versions',
        selectVersion: '/api/v1/datasets/versions/select',
        storage: '/api/v1/datasets/storage',
    },
    upload: '/api/v1/upload',
    uploadPreview: '/api/v1/upload/preview',
    database: {
        connect: '/api/v1/database/connect',
        status: '/api/v1/database/status',
        tables: '/api/v1/database/tables',
        load: '/api/v1/database/load',
    },
    scatter: {
        points: '/api/v1/scatter/points',
        matrix: '/api/v1/scatter/matrix',
        exportParquet: '/api/v1/scatter/export/parquet',
        correlations: '/api/v1/scatter/correlations',
        correlationMatrix: '/api/v1/scatter/correlations/matrix',
    },
    analytics: {
        rolling: '/api/v1/analytics/rolling',
        anomalies: '/api/v1/analytics/anomalies',
        fft: '/api/v1/analytics/fft',
        spectrogram: '/api/v1/analytics/spectrogram',
        spectralFilter: '/api/v1/analytics/spectral-filter',
        causal: '/api/v1/analytics/causal',
        removeOutliers: '/api/v1/analytics/remove_outliers',
    },
    transform: '/api/v1/transform',
    drift: {
        stats: '/api/v1/drift/stats',
        investigate: '/api/v1/drift/investigate',
    },
} as const;

/** Adds a query string without making route-family modules rebuild paths. */
export function withApiQuery(path: string, params: URLSearchParams): string {
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}
