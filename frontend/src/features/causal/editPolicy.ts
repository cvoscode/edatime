import type { CausalLink } from './causalComparison.js';
import { pairKey } from './selectionState.js';

export type PairEdgeDraftValidation =
    | { ok: true; connections: CausalLink[] }
    | { ok: false; message: string };

/** Validates and normalizes the mutable connections for one visual pair edge. */
export function validatePairEdgeDraft(input: {
    pairKey: string;
    columns: readonly string[];
    connections: readonly CausalLink[];
}): PairEdgeDraftValidation {
    const connections: CausalLink[] = [];
    for (const link of input.connections) {
        const source = String(link.source || '');
        const target = String(link.target || '');
        const lag = Number(link.lag);
        const value = Number(link.value);
        const pvalue = Number(link.pvalue);
        if (!source || !target || source === target) {
            return { ok: false, message: 'Each edge connection needs two different nodes.' };
        }
        if (!input.columns.includes(source) || !input.columns.includes(target)) {
            return { ok: false, message: 'Edge connections must reference nodes in the current graph.' };
        }
        if (pairKey(source, target) !== input.pairKey) {
            return { ok: false, message: 'Edit connections only between this pair of nodes.' };
        }
        if (!Number.isFinite(lag) || lag < 0 || !Number.isFinite(value) || !Number.isFinite(pvalue)) {
            return { ok: false, message: 'Lag, value, and p-value must be finite numeric values.' };
        }
        connections.push({ source, target, lag: Math.trunc(Math.max(0, lag)), type: String(link.type || '-->'), value, pvalue });
    }
    return { ok: true, connections };
}
