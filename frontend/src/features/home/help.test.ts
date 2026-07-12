import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'frontend/index.html'), 'utf8');

describe('home page help button', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <section id="page-home" data-page-name="home">
                <div class="page-header">
                    <h1 class="page-header__title">Home</h1>
                    <button id="home-help-btn" type="button">?</button>
                </div>
            </section>
        `;
    });

    afterEach(() => {
        document.getElementById('page-help-modal')?.remove();
        document.body.innerHTML = '';
    });

    it('ships a real <button> with id "home-help-btn" inside #page-home', () => {
        // Index-level assertion: a structural change to the home page
        // shouldn't accidentally drop the help trigger.
        expect(indexHtml).toMatch(/<button[^>]*id="home-help-btn"[^>]*>\?<\/button>/);
        const match = indexHtml.match(/<section[^>]*id="page-home"[\s\S]*?<\/section>/);
        expect(match?.[0] ?? '').toContain('id="home-help-btn"');
    });

    it('initHomePage binds the button and opens the modal on click', async () => {
        const { initHomePage } = await import('./help.js');
        initHomePage();

        const trigger = document.getElementById('home-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        expect(trigger.getAttribute('aria-label')).toBe('Show help for the Home page');

        trigger.click();
        const modal = document.getElementById('page-help-modal');
        expect(modal).not.toBeNull();
        expect(modal?.textContent).toContain('Home — Help');
        // Intro and at least the "Sections on this page" heading should be present.
        expect(modal?.textContent).toContain('Sections on this page');
        expect(modal?.textContent).toContain('ETTm2');
        expect(modal?.textContent).toContain('Ctrl+K');
    });

    it('initHomePage is safe to call twice (idempotent)', async () => {
        const { initHomePage } = await import('./help.js');
        const focusSpy = vi.spyOn(
            document.getElementById('home-help-btn') as HTMLButtonElement,
            'focus',
        );
        initHomePage();
        initHomePage();
        // Only one binding attribute, no errors.
        const trigger = document.getElementById('home-help-btn') as HTMLButtonElement;
        expect(trigger.getAttribute('data-page-help-bound')).toBe('true');
        // Clicking once should still produce exactly one modal.
        trigger.click();
        expect(document.querySelectorAll('#page-help-modal').length).toBe(1);
        focusSpy.mockRestore();
    });
});
