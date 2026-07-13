import { describe, expect, it } from 'vitest';
import { appendDraftConnection, createPairEdgeDraft, removeDraftAttribute } from './editDraft.js';

describe('causal edge edit draft', () => {
    const group = {
        key: 'A||B', nodeA: 'A', nodeB: 'B', connections: [
            { source: 'A', target: 'B', lag: 2, type: '-->', value: 1, pvalue: 0.01 },
        ],
    } as any;

    it('preserves editable attributes and appends the next lag for the pair', () => {
        let id = 0;
        const nextId = (prefix: string) => `${prefix}-${++id}`;
        const draft = createPairEdgeDraft(group, { note: 'kept', config: { depth: 2 } }, nextId);

        expect(draft.attrs.map(({ key, value }) => ({ key, value }))).toEqual([
            { key: 'note', value: 'kept' }, { key: 'config', value: '{"depth":2}' },
        ]);
        expect(appendDraftConnection(draft, nextId).lag).toBe(3);
        expect(removeDraftAttribute(draft, draft.attrs[0].draftId).attrs).toHaveLength(1);
    });
});
