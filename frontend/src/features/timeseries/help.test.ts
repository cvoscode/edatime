import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('timeseries page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-timeseries" data-page-name="timeseries">
                <div class="page-header">
                    <h1 class="page-header__title">Timeseries</h1>
                    <button id="timeseries-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "timeseries-help-btn" inside #page-timeseries', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="timeseries-help-btn"[^>]*>/);
        const match = indexHtml.match(/<section[^>]*id="page-timeseries"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="timeseries-help-btn"');
    });

    it('initTimeseriesHelp binds the button and opens the modal on click', async () => {
        const { initTimeseriesHelp } = await import('./help.js');
        initTimeseriesHelp();

        const trigger = document.getElementById('timeseries-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Signals page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Signals — Help');
        // Each section heading should appear in the modal.
        expect(modal?.textContent).toContain('Command bar (top)');
        expect(modal?.textContent).toContain('Utility shelf');
        expect(modal?.textContent).toContain('Chart area');
        expect(modal?.textContent).toContain('Overlays');
        expect(modal?.textContent).toContain('Ctrl+click');
        expect(modal?.textContent).toContain('Shift+C');
    });

    it('initTimeseriesHelp is safe to call twice (idempotent)', async () => {
        const { initTimeseriesHelp } = await import('./help.js');
        initTimeseriesHelp();
        initTimeseriesHelp();
        const trigger = document.getElementById('timeseries-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});
