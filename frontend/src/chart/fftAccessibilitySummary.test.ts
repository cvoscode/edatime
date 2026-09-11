import { describe, expect, it } from 'vitest';
import { createFftAccessibilitySummary } from './fftAccessibilitySummary.js';

describe('createFftAccessibilitySummary', () => {
    it('computes population standard deviation and median for displayed values', () => {
        const table = createFftAccessibilitySummary({
            series: [{
                type: 'line',
                name: 'HUFL',
                color: '#00aaff',
                data: [[0, 1], [1, 2], [2, 5], [3, 8]],
                _raw: [],
                _preLog: [],
            }],
        }, 'magnitude', true, { mode: 'none', clip: 'none', clipParam: 0 });

        const cells = Array.from(table!.querySelectorAll('tbody td')).map((cell) => cell.textContent);
        expect(cells[4]).toBe('2.7386');
        expect(cells[5]).toBe('3.5');
    });
});
