import { describe, expect, it } from 'vitest';

import { apiV1Routes, withApiQuery } from './routes.js';

describe('API v1 route contract', () => {
    it('owns every frontend route-family base path', () => {
        expect(apiV1Routes).toMatchObject({
            metadata: '/api/v1/metadata',
            data: '/api/v1/data',
            exportParquet: '/api/v1/export/parquet',
            upload: '/api/v1/upload',
            uploadPreview: '/api/v1/upload/preview',
            transform: '/api/v1/transform',
            analytics: {
                rolling: '/api/v1/analytics/rolling',
                anomalies: '/api/v1/analytics/anomalies',
                fft: '/api/v1/analytics/fft',
                spectrogram: '/api/v1/analytics/spectrogram',
                spectralFilter: '/api/v1/analytics/spectral-filter',
                causal: '/api/v1/analytics/causal',
                removeOutliers: '/api/v1/analytics/remove_outliers',
            },
            scatter: {
                points: '/api/v1/scatter/points',
                matrix: '/api/v1/scatter/matrix',
                exportParquet: '/api/v1/scatter/export/parquet',
                correlations: '/api/v1/scatter/correlations',
                correlationMatrix: '/api/v1/scatter/correlations/matrix',
            },
        });
        expect(apiV1Routes.sample('name with spaces.csv')).toBe('/api/v1/sample/name%20with%20spaces.csv');
    });

    it('adds query parameters without changing a route identity', () => {
        expect(withApiQuery(apiV1Routes.data, new URLSearchParams({ columns: 'value,temp' })))
            .toBe('/api/v1/data?columns=value%2Ctemp');
        expect(withApiQuery(apiV1Routes.metadata, new URLSearchParams()))
            .toBe('/api/v1/metadata');
    });
});
