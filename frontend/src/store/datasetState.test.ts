import { beforeEach, describe, expect, it } from 'vitest';

import { datasetState, setMetadata } from './datasetState.js';

describe('setMetadata', () => {
    beforeEach(() => {
        datasetState.metadata = null;
        datasetState.numericCols = [];
    });

    it('derives numericCols from metadata.columns order before numeric_columns order', () => {
        setMetadata({
            columns: [
                { name: 'date', dtype: 'Datetime' },
                { name: 'HUFL', dtype: 'Float64' },
                { name: 'HULL', dtype: 'Float64' },
                { name: 'LUFL', dtype: 'Float64' },
                { name: 'LULL', dtype: 'Float64' },
                { name: 'MUFL', dtype: 'Float64' },
                { name: 'MULL', dtype: 'Float64' },
                { name: 'OT', dtype: 'Float64' },
            ],
            numeric_columns: ['HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT'],
            time_column: 'date',
        } as any);

        expect(datasetState.numericCols).toEqual(['HUFL', 'HULL', 'LUFL', 'LULL', 'MUFL', 'MULL', 'OT']);
    });
});
