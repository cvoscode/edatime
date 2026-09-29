import { describe, expect, it } from 'vitest';
import { findZeroPlateauObservations } from './zeroPlateauObservations.js';

describe('findZeroPlateauObservations', () => {
    it('flags only long runs from exact profiles and leaves the source unchanged', () => {
        const metadata = {
            profile_status: 'exact', total_rows: 1000, columns: [], numeric_columns: [], time_column: 'ts', time_range: null,
            column_profiles: [
                { name: 'HULL', zero_count: 800, longest_zero_run: 698, longest_zero_run_start_ms: 100, longest_zero_run_end_ms: 200 },
                { name: 'OT', zero_count: 1, longest_zero_run: 1 },
            ],
        } as any;
        expect(findZeroPlateauObservations(metadata).map(({ column, consecutiveRows }) => ({ column, consecutiveRows })))
            .toEqual([{ column: 'HULL', consecutiveRows: 698 }]);
        expect(metadata.column_profiles[0].zero_count).toBe(800);
    });

    it('does not infer plateaus from sampled or immediate profiles', () => {
        expect(findZeroPlateauObservations({ profile_status: 'sampled', column_profiles: [{ name: 'x', zero_count: 100, longest_zero_run: 80 }] } as any)).toEqual([]);
    });
});
