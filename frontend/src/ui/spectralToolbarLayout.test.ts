import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const toolbarCss = readFileSync(join(process.cwd(), 'frontend/css/modules/toolbar.css'), 'utf8');

describe('spectral toolbar layout', () => {
    it('keeps explicit clip method and parameter fields on both spectral pages', () => {
        expect(indexHtml).toContain('id="fft-clip-method"');
        expect(indexHtml).toContain('id="fft-clip-param"');
        expect(indexHtml).toContain('id="spectrogram-clip-method"');
        expect(indexHtml).toContain('id="spectrogram-clip-param"');
    });

    it('lets the FFT and spectrogram display rows wrap instead of clipping clip controls', () => {
        expect(toolbarCss).toContain('#page-fft .scatter-toolbar__segment--display .scatter-toolbar__fields');
        expect(toolbarCss).toContain('#page-spectrogram .scatter-toolbar__segment--display .scatter-toolbar__fields');
        expect(toolbarCss).toMatch(/#page-fft\s+\.scatter-toolbar__segment--display\s+\.scatter-toolbar__fields,[^}]*flex-wrap:\s*wrap;/s);
        expect(toolbarCss).toMatch(/#page-spectrogram\s+\.scatter-toolbar__segment--display\s+\.scatter-toolbar__fields\s*\{[^}]*row-gap:\s*4px;/s);
    });
});
