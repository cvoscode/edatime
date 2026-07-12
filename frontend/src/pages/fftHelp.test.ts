import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('FFT page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-fft" data-page-name="fft">
                <div class="page-header">
                    <h1 class="page-header__title">FFT / PSD</h1>
                    <button id="fft-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "fft-help-btn" inside #page-fft', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="fft-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-fft"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="fft-help-btn"');
    });

    it('initFftHelp binds the button and opens the modal on click', async () => {
        const { initFftHelp } = await import('./fftHelp.js');
        initFftHelp();

        const trigger = document.getElementById('fft-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the FFT page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('FFT — Help');
        // Section headings should be present.
        expect(modal?.textContent).toContain('Display segment');
        expect(modal?.textContent).toContain('Pre-scaling segment');
        expect(modal?.textContent).toContain('FFT chart');
        expect(modal?.textContent).toContain('Magnitude');
        expect(modal?.textContent).toContain('PSD');
        expect(modal?.textContent).toContain('Outliers');
    });

    it('initFftHelp is safe to call twice (idempotent)', async () => {
        const { initFftHelp } = await import('./fftHelp.js');
        initFftHelp();
        initFftHelp();
        const trigger = document.getElementById('fft-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});