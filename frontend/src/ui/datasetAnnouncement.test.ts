import { describe, expect, it } from 'vitest';
import { formatActiveDatasetAnnouncement } from './datasetAnnouncement.js';

describe('formatActiveDatasetAnnouncement', () => {
    it('reports the canonical ETTm2 row and column counts with its UTC range', () => {
        const start = Date.parse('2016-07-01T00:00:00Z');
        const end = Date.parse('2018-07-01T00:00:00Z');
        const message = formatActiveDatasetAnnouncement({
            source_name: 'ETTm2.csv', total_rows: 69_680, columns: Array.from({ length: 8 }, (_, i) => ({ name: String(i), dtype: 'Float64' })),
            numeric_columns: ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'],
            time_column: 'date', time_range: { min: start, max: end },
        } as any, 'ettm2-v1');
        expect(message).toContain('ETTm2.csv');
        expect(message).toContain('69,680 rows, 8 columns, 7 numeric columns');
        expect(message).toContain('2016-07-01T00:00:00.000Z to 2018-07-01T00:00:00.000Z');
    });

    it('announces the prepared version display name and revision', () => {
        const message = formatActiveDatasetAnnouncement({
            display_name: 'ETTm2.csv · prepared v2', source_name: 'ETTm2.csv', source_version_revision: 2,
            total_rows: 12, columns: [{ name: 'date', dtype: 'Datetime' }], numeric_columns: [],
            time_column: 'date', time_range: { min: 0, max: 1 },
        } as any, 'source-2');
        expect(message).toContain('Active dataset: ETTm2.csv · prepared v2, revision 2.');
    });

    it('reports missing dataset metadata without inventing counts', () => {
        expect(formatActiveDatasetAnnouncement(null)).toBe('');
    });
});
