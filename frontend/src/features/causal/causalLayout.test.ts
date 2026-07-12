import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('causal toolbar lag contract', () => {
    it('advertises the raised 128-lag ceiling in the tau control', () => {
        expect(indexHtml).toContain('id="causal-tau-max"');
        expect(indexHtml).toContain('max="128"');
        expect(indexHtml).toContain('Maximum time lag τ to test (1–128)');
        expect(indexHtml).toContain('id="settings-tau-max"');
    });
});
