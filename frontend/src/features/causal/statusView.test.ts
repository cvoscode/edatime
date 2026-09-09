import { beforeEach, describe, expect, it } from 'vitest';

import { showCausalGraphRenderFailure, syncCausalEmptyState } from './statusView.js';

describe('syncCausalEmptyState', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="causal-empty-state" data-empty-reason="no-columns-selected">
                <strong>No causal graph yet</strong><span>Select columns.</span>
            </div>
        `;
    });

    it('shows a useful fallback when discovery succeeds but chart rendering does not', () => {
        showCausalGraphRenderFailure(7, 65);
        const empty = document.getElementById('causal-empty-state') as HTMLElement;

        expect(empty.hidden).toBe(false);
        expect(empty.dataset.emptyReason).toBe('render-failed');
        expect(empty.textContent).toContain('7 nodes and 65 links');

        syncCausalEmptyState(2);
        expect(empty.hidden).toBe(true);
        expect(empty.textContent).toContain('No causal graph yet');
    });

    it('keeps the empty state visible until at least two numeric columns are selected', () => {
        syncCausalEmptyState(1);
        expect((document.getElementById('causal-empty-state') as HTMLElement).hidden).toBe(false);

        syncCausalEmptyState(2);
        expect((document.getElementById('causal-empty-state') as HTMLElement).hidden).toBe(true);
    });
});
