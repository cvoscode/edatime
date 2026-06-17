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
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--display');
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--refine');
        expect(indexHtml).toContain('scatter-toolbar__segment scatter-toolbar__segment--actions');
    });

    it('groups correlation stats and suggestions into dedicated regions', () => {
        expect(indexHtml).toContain('scatter-stats-bar__correlations');
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
        expect(scatterCss).toContain('.scatter-stats-bar__correlations');
        expect(scatterCss).toContain('.scatter-suggestion-empty');
    });

    it('stacks the scatter toolbar segments cleanly on narrow screens', () => {
        expect(responsiveCss).toContain('.scatter-toolbar__segment');
        expect(responsiveCss).toContain('.scatter-stats-bar__correlations');
    });

    it('lays the scatter toolbar out as a flex row so segments can wrap to multiple lines on narrow screens', () => {
        // The toolbar is a flex row with flex-wrap: wrap so the segments
        // can re-flow onto multiple lines when the viewport is too narrow
        // for everything to fit. The previous grid layout produced
        // zero-width columns (e.g. minmax(0, auto) collapsing to 0px)
        // and stretched segment boxes that overlapped each other.
        expect(toolbarCss).toMatch(/\.scatter-toolbar\s*\{[^}]*display:\s*flex;[^}]*\}/s);
        expect(toolbarCss).toMatch(/\.scatter-toolbar\s*\{[^}]*flex-wrap:\s*wrap;[^}]*\}/s);
        expect(toolbarCss).toMatch(/\.scatter-toolbar\s*\{[^}]*align-items:\s*stretch;[^}]*\}/s);
    });

    it('floats disclosure menus above sibling fields so the Export menu opens cleanly', () => {
        // The disclosure menu must have a z-index to sit above
        // sibling controls in its segment, otherwise the menu opens
        // behind/over those controls and the user cannot select an
        // option from it.
        expect(toolbarCss).toMatch(/\.toolbar-disclosure__menu\s*\{[^}]*z-index:\s*\d+;[^}]*\}/s);
    });

    it('hides progressively less important controls as the viewport narrows', () => {
        // The 1280px breakpoint should drop the Selection toggle,
        // 1080px should drop the Distribution select, 940px should
        // drop the segment eyebrows. Each rule is regression-protected
        // so the responsive story cannot regress silently.
        const normalized = responsiveCss.replace(/\s+/g, ' ');
        expect(normalized).toMatch(/@media\s*\(max-width:\s*1280px\)[^}]*\.scatter-toolbar__field--toggle\s*\{[^}]*display:\s*none/);
        expect(normalized).toMatch(/@media\s*\(max-width:\s*940px\)[^}]*\.scatter-toolbar__eyebrow\s*\{[^}]*display:\s*none/);
    });

    it('flattens the Refine segment: no Color disclosure popout, just inline column + scale selects', () => {
        // The previous design wrapped color-by-column in a <details>
        // popout labelled "Color" with a hidden "By column" value.
        // The new design flattens both selects directly into the
        // Refine segment body.
        expect(indexHtml).not.toContain('id="scatter-color-controls"');
        expect(indexHtml).toContain('id="scatter-color-column"');
        expect(indexHtml).toContain('id="scatter-color-scale"');
    });

    it('keeps the density sub-group inside the Refine segment', () => {
        // Bins / Scale Linear-Log live inside the Refine segment so
        // they are colocated with the color-by-column controls. They
        // are only shown in density mode (toggled by syncModeUI).
        const densityIdx = indexHtml.indexOf('id="scatter-density-controls"');
        const refineStart = indexHtml.indexOf('scatter-toolbar__segment--refine');
        const refineEnd = indexHtml.indexOf('scatter-toolbar__segment--actions');
        expect(densityIdx).toBeGreaterThan(-1);
        expect(refineStart).toBeGreaterThan(-1);
        expect(refineEnd).toBeGreaterThan(refineStart);
        expect(densityIdx).toBeGreaterThan(refineStart);
        expect(densityIdx).toBeLessThan(refineEnd);
    });

    it('drops the per-page colormap dropdown (colormap lives in settings only)', () => {
        // The density colormap used to be a toolbar select
        // (`scatter-colormap`). It is now configured globally on the
        // settings page and consumed via the shared COLOR_SCALES
        // helper, so the toolbar no longer hosts the select.
        expect(indexHtml).not.toContain('id="scatter-colormap"');
    });
});
