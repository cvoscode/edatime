import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('initAnalyticsDrawer', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        document.body.className = 'drawer-open';
        document.body.innerHTML = `
            <button id="open-analytics-panel-btn" type="button">Open</button>
            <main id="app-shell">
                <div id="signals-analytics-modal" class="modal-backdrop" hidden>
                    <div role="dialog" aria-modal="true" aria-labelledby="analytics-title">
                        <h2 id="analytics-title">Analytics</h2>
                        <button id="analytics-close-btn" type="button">Close</button>
                        <input id="rolling-window" type="number">
                        <button id="transform-open-btn" type="button">Transform</button>
                        <button id="outlier-open-btn" type="button">Outliers</button>
                        <button id="analytics-done-btn" type="button">Done</button>
                    </div>
                </div>
            </main>
        `;
    });

    it('resets stale drawer state and opens as a modal', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');

        initAnalyticsDrawer();

        expect(document.body.classList.contains('drawer-open')).toBe(false);
        const modal = document.getElementById('signals-analytics-modal') as HTMLElement;
        expect(modal.hidden).toBe(true);
        expect(modal.parentElement).toBe(document.body);

        document.getElementById('open-analytics-panel-btn')?.click();

        expect(modal.hidden).toBe(false);
        expect(document.activeElement).toBe(document.getElementById('analytics-close-btn'));
    });

    it('closes with Done and restores focus to the toolbar trigger', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');
        initAnalyticsDrawer();
        const trigger = document.getElementById('open-analytics-panel-btn') as HTMLButtonElement;
        const modal = document.getElementById('signals-analytics-modal') as HTMLElement;

        trigger.focus();
        trigger.click();
        document.getElementById('analytics-done-btn')?.click();

        expect(modal.hidden).toBe(true);
        expect(document.activeElement).toBe(trigger);
    });

    it('closes from the backdrop and Escape key', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');
        initAnalyticsDrawer();
        const trigger = document.getElementById('open-analytics-panel-btn') as HTMLButtonElement;
        const modal = document.getElementById('signals-analytics-modal') as HTMLElement;

        trigger.click();
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(modal.hidden).toBe(true);

        trigger.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(modal.hidden).toBe(true);
    });

    it('hands off to nested preparation tools instead of stacking modals', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');
        initAnalyticsDrawer();
        const modal = document.getElementById('signals-analytics-modal') as HTMLElement;

        document.getElementById('open-analytics-panel-btn')?.click();
        document.getElementById('transform-open-btn')?.click();

        expect(modal.hidden).toBe(true);
    });

    it('releases its toggle binding when the deferred shell disposes it', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');
        const dispose = initAnalyticsDrawer();
        dispose();

        document.getElementById('open-analytics-panel-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect((document.getElementById('signals-analytics-modal') as HTMLElement).hidden).toBe(true);
    });
});
