import { describe, expect, it } from 'vitest';

import {
    getAnalyticsChipColor,
    getDefaultTimeseriesColumns,
    getNumericColumns,
} from './analyticsColumns.js';

const metadata = (numericColumns: string[], timeColumn = 'timestamp') => ({
    numeric_columns: numericColumns,
    time_column: timeColumn,
}) as any;

describe('analytics page utilities', () => {
    it('excludes the configured time column and legacy ts column from numeric choices', () => {
        expect(getNumericColumns(metadata(['timestamp', 'ts', 'load', 'temperature']))).toEqual([
            'load',
            'temperature',
        ]);
    });

    it('uses a caller override before falling back to the stable shared palette', () => {
        expect(getAnalyticsChipColor('load', { load: '#123456' })).toBe('#123456');
        expect(getAnalyticsChipColor('load')).toMatch(/^#/);
        expect(getAnalyticsChipColor('load')).not.toBe(getAnalyticsChipColor('other'));
    });

    it('selects a likely target after up to two feature columns', () => {
        expect(getDefaultTimeseriesColumns(metadata(['HUFL', 'HULL', 'MUFL', 'OT']))).toEqual([
            'HUFL',
            'HULL',
            'OT',
        ]);
    });

    it('keeps the first three numeric columns when no likely target exists', () => {
        expect(getDefaultTimeseriesColumns(metadata(['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c']);
    });
});
