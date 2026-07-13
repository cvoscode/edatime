import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    applyTheme: vi.fn(),
    loadSettings: vi.fn(() => ({ theme: 'dark' })),
    saveSettings: vi.fn(),
}));

vi.mock('../../utils/settings.js', () => mocks);

describe('initThemeToggle', () => {
    it('releases its header click listener when disposed', async () => {
        document.body.innerHTML = '<button id="theme-toggle-btn" type="button"></button>';
        const { initThemeToggle } = await import('./themeToggle.js');
        const dispose = initThemeToggle();
        dispose();

        (document.getElementById('theme-toggle-btn') as HTMLButtonElement).click();

        expect(mocks.applyTheme).not.toHaveBeenCalled();
    });
});
