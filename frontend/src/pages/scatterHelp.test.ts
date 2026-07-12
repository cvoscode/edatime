import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('scatter page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-scatter" data-page-name="scatter">
                <div class="page-header">
                    <h1 class="page-header__title">Scatter</h1>
                    <button id="scatter-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "scatter-help-btn" inside #page-scatter', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="scatter-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-scatter"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="scatter-help-btn"');
    });

    it('initScatterHelp binds the button and opens the modal on click', async () => {
        const { initScatterHelp } = await import('./scatterHelp.js');
        initScatterHelp();

        const trigger = document.getElementById('scatter-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Scatter page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Scatter — Help');
        // Section headings should be present.
        expect(modal?.textContent).toContain('View toolbar');
        expect(modal?.textContent).toContain('Display segment');
        expect(modal?.textContent).toContain('Linked filters');
        expect(modal?.textContent).toContain('Plot interactions');
        expect(modal?.textContent).toContain('Export');
        // Notable concepts.
        expect(modal?.textContent).toContain('Color by');
        expect(modal?.textContent).toContain('Density');
    });

    it('initScatterHelp is safe to call twice (idempotent)', async () => {
        const { initScatterHelp } = await import('./scatterHelp.js');
        initScatterHelp();
        initScatterHelp();
        const trigger = document.getElementById('scatter-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});