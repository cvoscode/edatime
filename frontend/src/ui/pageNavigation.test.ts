import { beforeEach, describe, expect, it, vi } from 'vitest';

const preloadPageStylesMock = vi.fn<(page: string) => void>();
const pageNeedsDatasetBootstrapMock = vi.fn<(page: string) => boolean>(() => false);
const openSettingsModalMock = vi.fn();

vi.mock('../utils/pageStyles.js', () => ({
    preloadPageStyles: (page: string) => preloadPageStylesMock(page),
}));

vi.mock('../utils/pageBootstrap.js', () => ({
    pageNeedsDatasetBootstrap: (page: string) => pageNeedsDatasetBootstrapMock(page),
}));

vi.mock('./settingsPanel.js', () => ({
    openSettingsModal: () => openSettingsModalMock(),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <div class="app-layout"></div>
        <nav class="sidebar">
            <button class="nav-item" data-page="home" type="button">Home</button>
            <button class="nav-item" data-page="upload" type="button">Upload</button>
            <button class="nav-item" data-page="timeseries" type="button">Timeseries</button>
            <button class="nav-item" data-page="settings" type="button">Settings</button>
        </nav>
        <section class="page" data-page-name="home"></section>
        <section class="page" data-page-name="upload" hidden></section>
        <section class="page" data-page-name="timeseries" hidden></section>
        <section class="page" data-page-name="scatter" hidden></section>
    `;
}

describe('initPageNavigation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();
        (window as any).__edatime = {};
    });

    it('opens the settings modal instead of switching to a blank settings page', async () => {
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation();

        await Promise.resolve();

        const homePage = document.querySelector('[data-page-name="home"]') as HTMLElement;
        expect(homePage.hidden).toBe(false);

        (document.querySelector('.nav-item[data-page="settings"]') as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(openSettingsModalMock).toHaveBeenCalledTimes(1);
        expect(homePage.hidden).toBe(false);
    });

    it('opens the hash-routed page instead of forcing home on initialization', async () => {
        window.history.replaceState(null, '', '#page=timeseries');
        const { initPageNavigation } = await import('./pageNavigation.js');

        initPageNavigation();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const homePage = document.querySelector('[data-page-name="home"]') as HTMLElement;
        const timeseriesPage = document.querySelector('[data-page-name="timeseries"]') as HTMLElement;
        expect(homePage.hidden).toBe(true);
        expect(timeseriesPage.hidden).toBe(false);
    });
});
