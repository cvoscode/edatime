import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const prepareSource = readFileSync(join(process.cwd(), 'frontend/src/features/prepare/index.ts'), 'utf8');

describe('analysis shell parity', () => {
    it('uses the shared page-header wrapper on Prepare', () => {
        expect(prepareSource).toContain("createElement('div', 'page-header prepare-workspace__header')");
    });

    it('keeps the workflow panel hidden until its deferred renderer has content', () => {
        expect(indexHtml).toContain('<section id="workflow-panel" class="workflow-panel" hidden></section>');
    });

    it('does not include the inherited range banner on the frequency analysis pages', () => {
        expect(indexHtml).not.toContain('Range inherited from Signals (24h · 7d · 30d · All).');
        expect(indexHtml).not.toContain('analysis-range-context');
    });
});
