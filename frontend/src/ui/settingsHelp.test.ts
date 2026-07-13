import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('settings help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="settings-modal" class="modal-backdrop settings-modal" hidden>
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                    <div class="modal-header">
                        <div class="modal-title" id="settings-title">Settings</div>
                        <button id="settings-help-btn" type="button">?</button>
                        <button class="btn btn-ghost" id="settings-close-btn" type="button">Close</button>
                    </div>
                </div>
            </div>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "settings-help-btn" inside the settings modal header', () => {
        expect(indexHtml).toMatch(/<button[^>]*id="settings-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<div[^>]*id="settings-modal"[\s\S]*?<\/div>\s*<\/div>/);
        expect(match?.[0] ?? '').toContain('id="settings-help-btn"');
    });

    it('initSettingsHelp binds the button and opens the modal on click', async () => {
        const { initSettingsHelp } = await import('./settingsHelp.js');
        initSettingsHelp();

        const trigger = document.getElementById('settings-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Settings page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Settings — Help');
        // Every supported tab section should be present.
        expect(modal?.textContent).toContain('Appearance tab');
        expect(modal?.textContent).toContain('Analytics tab');
        expect(modal?.textContent).toContain('Timeseries tab');
        expect(modal?.textContent).not.toContain('Export tab');
        expect(modal?.textContent).not.toContain('Spectral tab');
        expect(modal?.textContent).not.toContain('Causal tab');
    });

    it('initSettingsHelp is safe to call twice (idempotent)', async () => {
        const { initSettingsHelp } = await import('./settingsHelp.js');
        initSettingsHelp();
        initSettingsHelp();
        const trigger = document.getElementById('settings-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
    });
});
