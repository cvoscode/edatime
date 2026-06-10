import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSettingMock, updateSettingMock } = vi.hoisted(() => ({
    getSettingMock: vi.fn(() => true),
    updateSettingMock: vi.fn(),
}));

vi.mock('../utils/settings.js', () => ({
    getSetting: getSettingMock,
    updateSetting: (key: string, value: unknown) => updateSettingMock(key, value),
}));

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

    it('resets stale drawer-open state instead of auto-opening from persisted settings', async () => {
        const { initAnalyticsDrawer } = await import('./analyticsDrawer.js');

        initAnalyticsDrawer();

        expect(getSettingMock).not.toHaveBeenCalled();
        expect(updateSettingMock).toHaveBeenCalledWith('analyticsDrawerOpen', false);
        expect(document.body.classList.contains('drawer-open')).toBe(false);
        expect((document.getElementById('analytics-drawer') as HTMLElement).hidden).toBe(true);
    });
});
