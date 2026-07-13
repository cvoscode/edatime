import { describe, expect, it } from 'vitest';
import { renderEdgeDraftHtml } from './editPresentation.js';

describe('causal edge edit presentation', () => {
    it('renders escaped draft values and selected connection controls', () => {
        const html = renderEdgeDraftHtml({
            group: {
                nodeA: 'A', nodeB: 'B', direction: 'a_to_b', lags: [1],
                connections: [{ source: 'A', target: 'B', lag: 1, type: '-->', value: 2, pvalue: 0.01 }],
                hasUndirected: false, hasAmbiguous: false, minPValue: 0.01,
            },
            draft: {
                key: 'A||B', nodeA: 'A', nodeB: 'B',
                attrs: [{ draftId: 'attr-1', key: 'note', value: '<unsafe>' }],
                connections: [{ draftId: 'conn-1', source: 'A', target: 'B', lag: 1, type: '-->', value: 2, pvalue: 0.01 }],
            },
        });

        expect(html).toContain('value="&lt;unsafe&gt;"');
        expect(html).toContain('value="A" selected');
        expect(html).toContain('pmin 0.0100');
    });
});
