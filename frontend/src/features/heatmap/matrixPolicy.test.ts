import { describe, expect, it } from 'vitest';
import type { CorrelationMatrixResponse } from '../../services/api/analytics.js';
import { buildCorrelationMatrixCsv, buildHeatmapStatus, getSelectedCorrelationMatrix, getUnavailableMatrixMessage } from './matrixPolicy.js';

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

describe('buildCorrelationMatrixCsv', () => {
    it('writes one row per cell with valid n, excluded rows, and the working range', () => {
        const csv = buildCorrelationMatrixCsv({
            ...namedResponse,
            counts: [[10, 8], [8, 10]],
            input_rows: 10,
            time_range_ms: [0, 60_000],
        } as CorrelationMatrixResponse, 'pearson_raw');
        const lines = csv!.split('\n');
        expect(lines[0]).toBe('"row","column","metric","coefficient","valid_n","excluded","eligible","working_start_utc","working_end_utc"');
        expect(lines).toHaveLength(5);
        expect(lines[2]).toBe('"a","b","pearson_raw","0.5","8","2","10","1970-01-01T00:00:00.000Z","1970-01-01T00:01:00.000Z"');
    });

    it('uses difference counts and one fewer eligible row for change metrics', () => {
        const csv = buildCorrelationMatrixCsv({
            columns: ['a', 'b'],
            pearson_diff: [[1, 0.2], [0.2, 1]],
            diff_counts: [[9, 7], [7, 9]],
            input_rows: 10,
        } as CorrelationMatrixResponse, 'pearson_diff');
        expect(csv!.split('\n')[2]).toBe('"a","b","pearson_diff","0.2","7","2","9","",""');
    });

    it('leaves unknown values empty and escapes quotes in names', () => {
        const csv = buildCorrelationMatrixCsv({
            columns: ['say "hi"'],
            pearson_raw: [[null]],
        } as CorrelationMatrixResponse, 'pearson_raw');
        expect(csv!.split('\n')[1]).toBe('"say ""hi""","say ""hi""","pearson_raw","","","","","",""');
    });

    it('returns null when the metric is missing', () => {
        expect(buildCorrelationMatrixCsv(namedResponse, 'kendall_raw')).toBeNull();
    });
});
