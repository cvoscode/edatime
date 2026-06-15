import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');
const scatterCss = readFileSync(join(process.cwd(), 'frontend/css/modules/scatter.css'), 'utf8');
const responsiveCss = readFileSync(join(process.cwd(), 'frontend/css/modules/responsive.css'), 'utf8');

describe('scatter toolbar layout shell', () => {
    it('splits the scatter toolbar into explicit layout segments', () => {
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--view');
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--axes');
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--display');
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--actions');
    });

    it('groups correlation stats into metric and suggestion regions', () => {
        expect(indexHtml).toContain('scatter-stats-bar__metrics');
        expect(indexHtml).toContain('scatter-stats-bar__suggestions');
        expect(indexHtml).toContain('scatter-stat-chip');
    });

    it('defines dedicated scatter toolbar segment styling instead of relying on the base toolbar row', () => {
        expect(toolbarCss).toContain('.scatter-toolbar');
        expect(toolbarCss).toContain('.scatter-toolbar__segment');
        expect(toolbarCss).toContain('.scatter-toolbar__eyebrow');
    });

    it('adds scatter-specific chip and stats styling for the redesigned summary row', () => {
        expect(scatterCss).toContain('.scatter-stat-chip');
        expect(scatterCss).toContain('.scatter-stats-bar__suggestions');
        expect(scatterCss).toContain('.scatter-suggestion-empty');
    });

    it('stacks the scatter toolbar segments cleanly on narrow screens', () => {
        expect(responsiveCss).toContain('.scatter-toolbar__segment');
        expect(responsiveCss).toContain('.scatter-stats-bar__metrics');
    });
});
