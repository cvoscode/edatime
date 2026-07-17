import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('application markup ownership', () => {
    it('does not retain the unowned analytics compatibility modal', () => {
        expect(indexHtml).not.toContain('id="analytics-modal"');
        expect(indexHtml).not.toContain('analytics-done-btn-modal');
    });

    it('keeps the pipeline workbench trigger in the shared app header', () => {
        const headerStart = indexHtml.search(/<header[^>]*>/);
        const headerEnd = indexHtml.indexOf('</header>', headerStart);
        const headerMarkup = indexHtml.slice(headerStart, headerEnd);

        expect(headerMarkup).toContain('id="open-cleaning-plan-btn"');
        expect(indexHtml.match(/id="open-cleaning-plan-btn"/g)).toHaveLength(1);
    });
});
