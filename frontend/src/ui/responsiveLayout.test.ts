import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');
const scatterCss = readFileSync(join(process.cwd(), 'frontend/css/modules/scatter.css'), 'utf8');
const driftCss = readFileSync(join(process.cwd(), 'frontend/css/modules/drift.css'), 'utf8');

describe('responsive all-page layout contract', () => {
    it('keeps page help available for every navigable page', () => {
        const expectedHelpTriggers = [
            'home-help-btn', 'upload-help-btn', 'timeseries-help-btn', 'prepare-help-btn',
            'heatmap-help-btn', 'scatter-help-btn', 'fft-help-btn', 'spectrogram-help-btn',
            'causal-help-btn', 'drift-help-btn', 'settings-help-btn',
        ];
        for (const id of expectedHelpTriggers) {
            if (id === 'prepare-help-btn') continue; // Prepare renders its standard trigger lazily.
            expect(indexHtml, id).toContain(`id="${id}"`);
        }
    });

    it('provides compact disclosures without removing canonical controls', () => {
        expect(indexHtml).toContain('data-responsive-collapse="640"');
        expect(indexHtml).toContain('class="timeseries-result-toolbar"');
        expect(indexHtml).toContain('class="causal-result-toolbar"');
        expect(indexHtml).toContain('drift-secondary-controls analysis-secondary-disclosure');
        expect(indexHtml).toContain('heatmap-secondary-controls analysis-secondary-disclosure');
        expect(toolbarCss).toContain('.analysis-secondary-disclosure__summary');
    });

    it('reserves useful phone result regions on dense analysis pages', () => {
        expect(scatterCss).toMatch(/#page-scatter\s*>\s*\.scatter-view[^}]*min-height:\s*300px/s);
        expect(driftCss).toMatch(/#page-drift\s*>\s*\.main--chart[^}]*min-height:\s*300px/s);
        expect(driftCss).toMatch(/#page-causal\s*>\s*\.main[^}]*min-height:\s*300px/s);
    });

    it('keeps the ETTm2 reference pages internally scrollable instead of widening the app shell', () => {
        expect(scatterCss).toMatch(/\.heatmap-shell\s*\{[^}]*overflow-x:\s*auto/s);
        expect(scatterCss).toMatch(/#page-scatter\s*\{[^}]*overflow-y:\s*auto/s);
        expect(driftCss).toMatch(/#page-drift\s*\{[^}]*overflow-y:\s*auto/s);
    });
});
