import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const scatterCss = readFileSync(join(process.cwd(), 'frontend/css/modules/scatter.css'), 'utf8');

describe('scatter marginal CSS', () => {
    it('gives the x marginal an explicit width matching the chart span', () => {
        expect(scatterCss).toContain('.scatter-marginal-x');
        expect(scatterCss).toContain('width: calc(100% - var(--scatter-right, 72px));');
    });
});
