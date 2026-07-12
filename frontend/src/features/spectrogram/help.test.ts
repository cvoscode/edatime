import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('spectrogram page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-spectrogram" data-page-name="spectrogram">
                <div class="page-header">
                    <h1 class="page-header__title">Spectrogram</h1>
                    <button id="spectrogram-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "spectrogram-help-btn" inside #page-spectrogram', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="spectrogram-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-spectrogram"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="spectrogram-help-btn"');
    });

    it('initSpectrogramHelp binds the button and opens the modal on click', async () => {
        const { initSpectrogramHelp } = await import('./help.js');
        initSpectrogramHelp();

        const trigger = document.getElementById('spectrogram-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Spectrogram page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Spectrogram — Help');
        expect(modal?.textContent).toContain('Display segment');
        expect(modal?.textContent).toContain('Pre-scaling segment');
        expect(modal?.textContent).toContain('Spectrogram chart');
        expect(modal?.textContent).toContain('Window size');
        expect(modal?.textContent).toContain('Hop size');
        expect(modal?.textContent).toContain('Heisenberg');
    });

    it('initSpectrogramHelp is safe to call twice (idempotent)', async () => {
        const { initSpectrogramHelp } = await import('./help.js');
        initSpectrogramHelp();
        initSpectrogramHelp();
        const trigger = document.getElementById('spectrogram-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});
