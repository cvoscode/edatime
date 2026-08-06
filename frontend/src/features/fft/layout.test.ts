import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');
const fftCss = readFileSync(join(process.cwd(), 'frontend/src/features/fft/fft.css'), 'utf8');

describe('fft layout shell', () => {
    it('keeps the fft trace chips in a dedicated trace bar', () => {
        expect(indexHtml).toContain('<div class="fft-traces-bar" id="fft-traces-bar" hidden></div>');
    });

    it('defines a taller fft-only chip override instead of changing shared chip sizing', () => {
        expect(fftCss).toMatch(/\.fft-traces-bar\s+\.series-chip\s*\{[^}]*min-height:\s*26px;[^}]*padding:\s*3px 6px 3px 8px;[^}]*\}/s);
    });

    it('keeps one active FFT export control per format', () => {
        expect(indexHtml).not.toContain('fft-export-png-btn-fallback');
        expect(indexHtml).not.toContain('fft-export-svg-btn-fallback');
        expect(indexHtml).not.toContain('fft-export-html-btn-fallback');
        expect(indexHtml).not.toContain('fft-export-csv-btn-fallback');
    });

    it('provides compute actions in both the toolbar and empty state', () => {
        expect(indexHtml).toContain('id="fft-compute-btn"');
        expect(indexHtml).toContain('id="fft-empty-compute-btn"');
    });

    it('explains the inherited Signals range and reserves a sampling badge', () => {
        expect(indexHtml).toContain('Range inherited from Signals (24h · 7d · 30d · All).');
        expect(indexHtml).toContain('id="fft-sampling-badge"');
    });
});
