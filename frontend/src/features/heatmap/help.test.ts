import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('heatmap (Correlations) page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-heatmap" data-page-name="heatmap">
                <div class="page-header">
                    <h1 class="page-header__title">Correlations</h1>
                    <button id="heatmap-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "heatmap-help-btn" inside #page-heatmap', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="heatmap-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-heatmap"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="heatmap-help-btn"');
    });

    it('initHeatmapHelp binds the button and opens the modal on click', async () => {
        const { initHeatmapHelp } = await import('./help.js');
        initHeatmapHelp();

        const trigger = document.getElementById('heatmap-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Correlations page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Correlations — Help');
        // Section headings should be present.
        expect(modal?.textContent).toContain('Metric toolbar');
        expect(modal?.textContent).toContain('Display segment');
        expect(modal?.textContent).toContain('Matrix interactions');
        expect(modal?.textContent).toContain('Export');
        // Metric guidance should be in the modal.
        expect(modal?.textContent).toContain('Pearson');
        expect(modal?.textContent).toContain('Spearman');
        expect(modal?.textContent).toContain('Kendall');
    });

    it('initHeatmapHelp is safe to call twice (idempotent)', async () => {
        const { initHeatmapHelp } = await import('./help.js');
        initHeatmapHelp();
        initHeatmapHelp();
        const trigger = document.getElementById('heatmap-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});