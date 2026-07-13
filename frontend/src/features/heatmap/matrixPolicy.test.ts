import { describe, expect, it } from 'vitest';
import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { buildHeatmapStatus, getSelectedCorrelationMatrix, getUnsupportedMetricMessage } from './matrixPolicy.js';

const legacyResponse = {
    columns: ['a', 'b'],
    pearson: [[1, 0.5], [0.5, 1]],
    spearman: [[1, 0.4], [0.4, 1]],
} as CorrelationMatrixResponse;

describe('heatmap matrix policy', () => {
    it('selects named matrices and legacy raw fallbacks only', () => {
        expect(getSelectedCorrelationMatrix(legacyResponse, 'pearson_raw')).toBe(legacyResponse.pearson);
        expect(getSelectedCorrelationMatrix(legacyResponse, 'spearman_raw')).toBe(legacyResponse.spearman);
        expect(getSelectedCorrelationMatrix(legacyResponse, 'kendall_raw')).toBeNull();
    });

    it('builds compact status and unsupported-mode guidance', () => {
        expect(buildHeatmapStatus(4, 36, 2)).toBe('2 clusters · 4 columns · 36px cells');
        expect(buildHeatmapStatus(4, 36, null)).toBe('4 columns · 36px cells');
        expect(getUnsupportedMetricMessage('kendall_raw')).toContain('Kendall tau');
    });
});
