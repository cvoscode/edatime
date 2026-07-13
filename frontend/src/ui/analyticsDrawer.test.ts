import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('initAnalyticsDrawer', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        document.body.className = 'drawer-open';
        document.body.innerHTML = `
            <button id="open-analytics-panel-btn" type="button">Open</button>
            <div id="analytics-drawer" hidden></div>
            <button id="analytics-close-btn" type="button">Close</button>
        `;
    });

    it('resets stale drawer-open state instead of restoring a persisted preference', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');

        initAnalyticsDrawer();

        expect(document.body.classList.contains('drawer-open')).toBe(false);
        expect((document.getElementById('analytics-drawer') as HTMLElement).hidden).toBe(true);
    });
});
