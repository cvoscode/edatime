import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('upload page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-upload" data-page-name="upload">
                <div class="page-header">
                    <h1 class="page-header__title">Upload</h1>
                    <button id="upload-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "upload-help-btn" inside #page-upload', () => {
        // Index-level assertion: a structural change to the upload page
        // shouldn't accidentally drop the help trigger.
        expect(indexHtml).toMatch(/<button[^>]*id="upload-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-upload"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="upload-help-btn"');
    });

    it('initUploadHelp binds the button and opens the modal on click', async () => {
        const { initUploadHelp } = await import('./help.js');
        initUploadHelp();

        const trigger = document.getElementById('upload-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Upload page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Upload — Help');
        // Both tab sections and the preview section should be present.
        expect(modal?.textContent).toContain('File tab');
        expect(modal?.textContent).toContain('Database tab');
        expect(modal?.textContent).toContain('Preview & profile grid');
        expect(modal?.textContent).toContain('What happens at ingest');
        expect(modal?.textContent).toContain('Ctrl+K');
    });

    it('initUploadHelp is safe to call twice (idempotent)', async () => {
        const { initUploadHelp } = await import('./help.js');
        initUploadHelp();
        initUploadHelp();
        const trigger = document.getElementById('upload-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        // Only one modal can exist at a time.
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});