import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const responsiveCss = readFileSync(join(process.cwd(), 'frontend/css/modules/responsive.css'), 'utf8');

describe('scatter mobile responsive CSS', () => {
    it('does not reserve removed overlay widths for the scatter chart', () => {
        expect(responsiveCss).not.toContain('#scatter-chart { right: 220px; width: calc(100% - 220px); }');
        expect(responsiveCss).not.toContain('.scatter-marginal-x { right: 220px; }');
        expect(responsiveCss).not.toContain('#scatter-chart { right: 160px; width: calc(100% - 160px); }');
        expect(responsiveCss).not.toContain('.scatter-marginal-x { right: 160px; }');
    });
});