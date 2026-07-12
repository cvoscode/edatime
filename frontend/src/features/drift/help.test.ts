import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('drift page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-drift" data-page-name="drift">
                <div class="page-header">
                    <h1 class="page-header__title">Drift</h1>
                    <button id="drift-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "drift-help-btn" inside #page-drift', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="drift-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-drift"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="drift-help-btn"');
    });

    it('initDriftHelp binds the button and opens the modal on click', async () => {
        const { initDriftHelp } = await import('./help.js');
        initDriftHelp();

        const trigger = document.getElementById('drift-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Drift page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Drift — Help');
        expect(modal?.textContent).toContain('Column picker');
        expect(modal?.textContent).toContain('Window and reference');
        expect(modal?.textContent).toContain('Thresholds');
        expect(modal?.textContent).toContain('KS');
        expect(modal?.textContent).toContain('Wasserstein');
        expect(modal?.textContent).toContain('PSI');
    });

    it('initDriftHelp is safe to call twice (idempotent)', async () => {
        const { initDriftHelp } = await import('./help.js');
        initDriftHelp();
        initDriftHelp();
        const trigger = document.getElementById('drift-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});