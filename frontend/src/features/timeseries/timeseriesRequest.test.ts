import { describe, expect, it } from 'vitest';
import { buildTimeseriesDataRequest, getTimeseriesLookaroundMs } from './timeseriesRequest.js';

describe('timeseries data request', () => {
    it('serializes a valid request and enforces the lookaround floor', () => {
        const request = buildTimeseriesDataRequest({ start: 0, end: 10_000, columns: ['OT', 'HUFL'], colorColumn: 'group' }, 800);

        expect(request).toMatchObject({ width: 800, columns: 'OT,HUFL', colorColumn: 'group', lookaroundMs: 60_000 });
        expect(request?.startIso).toBe(new Date(0).toISOString());
    });

    it('rejects an invalid or empty request', () => {
        expect(buildTimeseriesDataRequest({ start: 2, end: 1, columns: ['OT'], colorColumn: null }, 0)).toBeNull();
        expect(buildTimeseriesDataRequest({ start: 1, end: 2, columns: [], colorColumn: null }, 0)).toBeNull();
    });

    it('uses the shared lookaround policy for large time ranges', () => {
        expect(getTimeseriesLookaroundMs(0, 100_000)).toBe(125_000);
    });
});
