import type { CausalLink } from './causalComparison.js';
import type { PairEdgeGroup } from './selectionState.js';

export interface EdgeDraftAttribute {
    draftId: string;
    key: string;
    value: string;
}

export interface EdgeDraftConnection extends CausalLink {
    draftId: string;
}

export interface EdgeEditDraft {
    key: string;
    nodeA: string;
    nodeB: string;
    attrs: EdgeDraftAttribute[];
    connections: EdgeDraftConnection[];
}

export function createPairEdgeDraft(
    group: Pick<PairEdgeGroup, 'key' | 'nodeA' | 'nodeB' | 'connections'>,
    attributes: Record<string, unknown>,
    nextId: (prefix: string) => string,
): EdgeEditDraft {
    return {
        key: group.key,
        nodeA: group.nodeA,
        nodeB: group.nodeB,
        attrs: Object.entries(attributes).map(([key, value]) => ({ draftId: nextId('attr'), key, value: stringifyDraftValue(value) })),
        connections: group.connections.map((link) => ({ draftId: nextId('conn'), ...link })),
    };
}

export function appendDraftConnection(draft: EdgeEditDraft, nextId: (prefix: string) => string): EdgeDraftConnection {
    const connection: EdgeDraftConnection = {
        draftId: nextId('conn'),
        source: draft.nodeA,
        target: draft.nodeB,
        lag: (draft.connections.at(-1)?.lag ?? 0) + 1,
        type: '-->', value: 0, pvalue: 0,
    };
    draft.connections.push(connection);
    return connection;
}

export function removeDraftAttribute(draft: EdgeEditDraft, draftId: string): EdgeEditDraft {
    draft.attrs = draft.attrs.filter((entry) => entry.draftId !== draftId);
    return draft;
}

export function removeDraftConnection(draft: EdgeEditDraft, draftId: string): EdgeEditDraft {
    draft.connections = draft.connections.filter((entry) => entry.draftId !== draftId);
    return draft;
}

function stringifyDraftValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    try { return JSON.stringify(value); } catch { return String(value); }
}
