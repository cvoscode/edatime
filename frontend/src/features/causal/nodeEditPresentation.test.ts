import { describe, expect, it } from 'vitest';
import { renderNodeEditHtml } from './nodeEditPresentation.js';

describe('causal node edit presentation', () => {
    it('escapes node values and serializes attributes for the editable form', () => {
        const html = renderNodeEditHtml({ label: '<node>', color: '#00a8ff', attributes: { threshold: 0.05 } });

        expect(html).toContain('value="&lt;node&gt;"');
        expect(html).toContain('&quot;threshold&quot;: 0.05');
    });
});
