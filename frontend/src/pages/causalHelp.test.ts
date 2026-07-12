import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('causal page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-causal" data-page-name="causal">
                <div class="page-header">
                    <h1 class="page-header__title">Causal</h1>
                    <button id="causal-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "causal-help-btn" inside #page-causal', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="causal-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-causal"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="causal-help-btn"');
    });

    it('initCausalHelp binds the button and opens the modal on click', async () => {
        const { initCausalHelp } = await import('./causalHelp.js');
        initCausalHelp();

        const trigger = document.getElementById('causal-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Causal page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Causal — Help');
        expect(modal?.textContent).toContain('Method picker');
        expect(modal?.textContent).toContain('PCMCI');
        expect(modal?.textContent).toContain('PCMCI+');
        expect(modal?.textContent).toContain('LPCMCI');
        expect(modal?.textContent).toContain('Graph view');
    });

    it('initCausalHelp is safe to call twice (idempotent)', async () => {
        const { initCausalHelp } = await import('./causalHelp.js');
        initCausalHelp();
        initCausalHelp();
        const trigger = document.getElementById('causal-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});