import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const chartCss = readFileSync(join(process.cwd(), 'frontend/css/modules/chart.css'), 'utf8');
const chipsCss = readFileSync(join(process.cwd(), 'frontend/css/modules/chips.css'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');
const responsiveCss = readFileSync(join(process.cwd(), 'frontend/css/modules/responsive.css'), 'utf8');

describe('timeseries layout shell', () => {
    it('does not keep the service worker active on localhost development hosts', () => {
        expect(indexHtml).toContain("localhost'");
        expect(indexHtml).toContain("127.0.0.1");
        expect(indexHtml).toContain('navigator.serviceWorker.getRegistrations()');
        expect(indexHtml).toContain('registration.unregister()');
    });

    it('uses a curved wave path for the shared EdaTime sparkline icon', () => {
        expect(indexHtml).not.toContain('<polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />');
        expect(indexHtml).toContain('<path d="M1 9');
    });

    it('uses dedicated command bar and utility shelf wrappers', () => {
        expect(indexHtml).toContain('timeseries-command-bar');
        expect(indexHtml).toContain('timeseries-chip-rail');
        expect(indexHtml).toContain('timeseries-utility-shelf');
    });

    it('keeps the timeseries chart area in a scrollable analysis shell with a stable chart viewport', () => {
        expect(indexHtml).toContain('<section class="page page--analysis-scroll" id="page-timeseries"');
        expect(indexHtml).toContain('<main class="main main--analysis-chart" id="main">');
    });

    it('positions direct chart canvas layers as overlays instead of stacked blocks', () => {
        expect(chartCss).toContain('#main-chart > canvas');
        expect(chartCss).toMatch(/#main-chart\s*>\s*canvas\s*\{[^}]*position:\s*absolute/s);
        expect(chartCss).toMatch(/#main-chart\s*>\s*canvas\s*\{[^}]*inset:\s*0/s);
    });

    it('defines scoped toolbar layout rules for the refreshed timeseries header', () => {
        expect(toolbarCss).toContain('.timeseries-command-bar');
        expect(toolbarCss).toContain('.timeseries-utility-shelf');
        expect(toolbarCss).toContain('.timeseries-command-bar__center');
    });

    it('adds responsive wrapping rules for the refreshed timeseries controls', () => {
        expect(responsiveCss).toContain('.timeseries-command-bar');
        expect(responsiveCss).toContain('.timeseries-chip-rail');
    });

    it('lets the chip rail wrap instead of hiding overflow behind horizontal scrolling', () => {
        expect(chipsCss).toMatch(/\.timeseries-chip-rail\s*\{[^}]*flex-wrap:\s*wrap;/s);
        expect(chipsCss).toMatch(/\.timeseries-chip-rail\s*\{[^}]*overflow-x:\s*visible;/s);
        expect(chipsCss).toContain('.timeseries-chip-status');
    });
});
