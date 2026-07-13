import { describe, expect, it } from 'vitest';
import { validatePairEdgeDraft } from './editPolicy.js';

describe('validatePairEdgeDraft', () => {
    it('normalizes valid connections and rejects links outside the edited pair', () => {
        expect(validatePairEdgeDraft({
            pairKey: 'A||B',
            columns: ['A', 'B'],
            connections: [{ source: 'A', target: 'B', lag: 1.8, type: '-->', value: 2, pvalue: 0.01 }],
        })).toEqual({ ok: true, connections: [{ source: 'A', target: 'B', lag: 1, type: '-->', value: 2, pvalue: 0.01 }] });

        expect(validatePairEdgeDraft({
            pairKey: 'A||B',
            columns: ['A', 'B', 'C'],
            connections: [{ source: 'A', target: 'C', lag: 0, type: '-->', value: 1, pvalue: 0.5 }],
        })).toEqual({ ok: false, message: 'Edit connections only between this pair of nodes.' });
    });
});
