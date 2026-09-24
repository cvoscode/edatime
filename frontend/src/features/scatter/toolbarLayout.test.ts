import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');
const scatterCss = readFileSync(join(process.cwd(), 'frontend/css/modules/scatter.css'), 'utf8');
const responsiveCss = readFileSync(join(process.cwd(), 'frontend/css/modules/responsive.css'), 'utf8');

describe('scatter toolbar layout shell', () => {
    it('keeps primary selectors visible and groups secondary controls into named panels', () => {
        const document = new DOMParser().parseFromString(
            indexHtml.slice(indexHtml.indexOf('<div id="scatter-toolbar"'), indexHtml.indexOf('<div class="analysis-toolbar scatter-stats-bar"')),
            'text/html',
        );
        const toolbar = document.querySelector('#scatter-toolbar')!;
        for (const id of ['scatter-x-col', 'scatter-y-col', 'scatter-render-mode']) {
            expect(toolbar.querySelector(`#${id}`)?.closest('details')).toBeNull();
            expect(toolbar.querySelector(`#${id}`)).not.toBeNull();
        }
        expect(Array.from(toolbar.querySelectorAll('summary'), element => element.textContent)).toEqual([
            'Display', 'Color & outliers', 'Export',
        ]);
    });

    it('groups correlation stats and suggestions into dedicated regions', () => {
        expect(indexHtml).toContain('scatter-stats-bar__correlations');
        expect(indexHtml).toContain('scatter-stats-bar__suggestions');
        expect(indexHtml).toContain('scatter-stat-chip');
    });

    it('defines dedicated scatter toolbar segment styling instead of relying on the base toolbar row', () => {
        expect(toolbarCss).toContain('.scatter-toolbar');
        // The segment/eyebrow styles are used by 8 different pages
        // (timeseries, scatter, drift, causal, fft, spectrogram,
        // heatmap, upload) so they live in toolbar.css to keep them
        // available at app start instead of behind the lazy scatter
        // stylesheet.
        expect(toolbarCss).toContain('.scatter-toolbar__segment');
        expect(toolbarCss).toContain('.scatter-toolbar__eyebrow');
    });

    it('adds scatter-specific chip and stats styling for the redesigned summary row', () => {
        // The shared segment/eyebrow/chip/stats-bar styles were moved
        // out of scatter.css into toolbar.css because the underlying
        // classes are also reused by the timeseries summary row.
        // `.scatter-suggestion-empty` is still scatter-only and lives
        // in scatter.css.
        expect(toolbarCss).toContain('.scatter-stat-chip');
        expect(toolbarCss).toContain('.scatter-stats-bar__suggestions');
        expect(toolbarCss).toContain('.scatter-stats-bar__correlations');
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

    it('keeps a local color column and a shared plot scale setting', () => {
        expect(indexHtml).not.toContain('id="scatter-color-controls"');
        expect(indexHtml).toContain('id="scatter-color-column"');
        expect(indexHtml).not.toContain('id="scatter-color-scale"');
        expect(indexHtml).toContain('data-plot-color-scale="pairPlot"');
    });

    it('keeps the density and marginal controls together in the Display panel', () => {
        const document = new DOMParser().parseFromString(
            indexHtml.slice(indexHtml.indexOf('<div id="scatter-toolbar"'), indexHtml.indexOf('<div class="analysis-toolbar scatter-stats-bar"')),
            'text/html',
        );
        const panel = document.querySelector('#scatter-display-options')!;
        for (const id of ['scatter-diagonal-mode', 'scatter-bin-size', 'scatter-normalization']) {
            expect(panel.querySelector(`#${id}`)).not.toBeNull();
        }
    });

    it('drops the per-page colormap dropdown (colormap lives in settings only)', () => {
        // The density colormap used to be a toolbar select
        // (`scatter-colormap`). It is now configured globally on the
        // settings page and consumed via the shared COLOR_SCALES
        // helper, so the toolbar no longer hosts the select.
        expect(indexHtml).not.toContain('id="scatter-colormap"');
    });
});
