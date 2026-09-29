import { describe, expect, it } from 'vitest';
import { buildCausalLinksTableHtml } from './linkTable.js';

describe('buildCausalLinksTableHtml', () => {
    it('shows exact link values from the causal graph and escapes labels', () => {
        const html = buildCausalLinksTableHtml([{
            source: 'A&B', target: 'C', lag: 2, type: '-->', value: 0.75, pvalue: 0.01234,
        }]);
        expect(html).toContain('A&amp;B');
        expect(html).toContain('0.7500');
        expect(html).toContain('0.0123');
        expect(html).toContain('Lag-specific links currently displayed');
    });

    it('clears the table when there are no links', () => {
        expect(buildCausalLinksTableHtml([])).toBe('');
    });
});
