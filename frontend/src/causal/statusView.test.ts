import { beforeEach, describe, expect, it } from 'vitest';

import { syncCausalEmptyState } from './statusView.js';

describe('syncCausalEmptyState', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="causal-empty-state" data-empty-reason="no-columns-selected"></div>
        `;
    });

    it('keeps the empty state visible until at least two numeric columns are selected', () => {
        syncCausalEmptyState(1);
        expect((document.getElementById('causal-empty-state') as HTMLElement).hidden).toBe(false);

        syncCausalEmptyState(2);
        expect((document.getElementById('causal-empty-state') as HTMLElement).hidden).toBe(true);
    });
});
