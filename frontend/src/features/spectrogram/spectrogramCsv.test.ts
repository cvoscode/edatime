import { describe, expect, it } from 'vitest';
import { buildSpectrogramCsv } from './runtime.js';

describe('spectrogram CSV export', () => {
    it('emits header + (time, frequency, power) triples matching the result shape', () => {
        const result = {
            column: 'HUFL',
            times_ms: [0, 60_000, 120_000],
            frequencies: [1.5, 2.0, 2.5, 3.0],
            magnitudes: [
                [10, 20, 30, 40],
                [11, 21, 31, 41],
                [12, 22, 32, 42],
            ],
        } as any;
        const csv = buildSpectrogramCsv(result);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('time_ms,frequency_hz,power');
        expect(lines.length).toBe(1 + 3 * 4);
        expect(lines[1]).toBe('0,1.5,10');
        expect(lines[4]).toBe('0,3,40');
        expect(lines.at(-1)).toBe('120000,3,42');
    });

    it('emits empty power cells when magnitudes are sparse', () => {
        const result = {
            column: 'HUFL',
            times_ms: [0],
            frequencies: [1, 2],
            magnitudes: [[1]],
        } as any;
        const csv = buildSpectrogramCsv(result);
        const lines = csv.split('\n');
        // inner loop still walks all frequencies; missing cell renders as ''
        expect(lines).toEqual([
            'time_ms,frequency_hz,power',
            '0,1,1',
            '0,2,',
        ]);
    });
});
