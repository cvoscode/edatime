import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initToolbarCollapse } from './toolbarCollapse.js';

describe('toolbar collapse', () => {
    let dispose: (() => void) | undefined;

    beforeEach(() => {
        document.body.innerHTML = `
          <section class="page" data-page-name="timeseries" data-toolbar-collapse>
            <div class="page-header"><div>Signals</div><button class="page-help-trigger">Help</button></div>
            <div class="toolbar">Controls</div>
          </section>
          <section class="page" data-page-name="home" data-toolbar-collapse><div class="page-header">Overview</div></section>
        `;
    });

    afterEach(() => dispose?.());

    it('adds a focus control to each marked workspace page', () => {
        dispose = initToolbarCollapse();

        expect(document.querySelectorAll('.toolbar-collapse-toggle')).toHaveLength(2);
        expect(document.querySelector('.toolbar-collapse-toggle')?.textContent).toBe('Focus view');
    });

    it('toggles the workspace chrome without removing controls', () => {
        dispose = initToolbarCollapse();
        const page = document.querySelector<HTMLElement>('[data-page-name="timeseries"]')!;
        const button = document.querySelector<HTMLButtonElement>('.toolbar-collapse-toggle')!;

        button.click();
        expect(page.classList.contains('workspace-controls-collapsed')).toBe(true);
        expect(button.textContent).toBe('Show controls');
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(page.querySelector('.toolbar')).toBeInstanceOf(HTMLElement);

        dispose();
        dispose = undefined;
        expect(page.classList.contains('workspace-controls-collapsed')).toBe(false);
        expect(document.querySelector('.toolbar-collapse-toggle')).toBeNull();
    });

    it('adds the focus control when the Preparation header renders later', async () => {
        const prepare = document.createElement('section');
        prepare.className = 'page';
        prepare.dataset.pageName = 'prepare';
        prepare.dataset.toolbarCollapse = '';
        document.body.append(prepare);
        dispose = initToolbarCollapse();

        prepare.innerHTML = `
          <div id="prepare-workspace">
            <div class="prepare-workspace__header"><div>Preparation</div></div>
          </div>
        `;
        await Promise.resolve();

        expect(prepare.querySelector('.toolbar-collapse-toggle')?.textContent).toBe('Focus view');
    });
});
