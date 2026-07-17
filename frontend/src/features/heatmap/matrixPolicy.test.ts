import { describe, expect, it } from 'vitest';
import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { buildHeatmapStatus, getSelectedCorrelationMatrix, getUnavailableMatrixMessage } from './matrixPolicy.js';

const namedResponse = {
    columns: ['a', 'b'],
    pearson_raw: [[1, 0.5], [0.5, 1]],
    spearman_raw: [[1, 0.4], [0.4, 1]],
} as CorrelationMatrixResponse;

describe('heatmap matrix policy', () => {
    it('selects only named response matrices', () => {
        expect(getSelectedCorrelationMatrix(namedResponse, 'pearson_raw')).toBe(namedResponse.pearson_raw);
        expect(getSelectedCorrelationMatrix(namedResponse, 'spearman_raw')).toBe(namedResponse.spearman_raw);
        expect(getSelectedCorrelationMatrix(namedResponse, 'kendall_raw')).toBeNull();
    });

    it('builds compact status and unavailable-matrix guidance', () => {
        expect(buildHeatmapStatus(4, 36)).toBe('4 columns · 36px cells');
        expect(getUnavailableMatrixMessage('kendall_raw')).toContain('Kendall tau');
    });
});
