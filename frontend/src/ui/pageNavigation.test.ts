import { beforeEach, describe, expect, it, vi } from 'vitest';

const preloadPageStylesMock = vi.fn<(page: string) => void>();
const pageNeedsDatasetBootstrapMock = vi.fn<(page: string) => boolean>(() => false);
const ensureSubsystemMock = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
const ensureDatasetReadyMock = vi.fn<(page?: string) => Promise<void>>().mockResolvedValue(undefined);
const ensurePageModuleLoadedMock = vi.fn<(page: string) => Promise<void>>().mockResolvedValue(undefined);
const openSettingsMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

function navigationDeps() {
    return {
        ensureSubsystem: ensureSubsystemMock,
        ensureDatasetReady: ensureDatasetReadyMock,
        ensurePageModuleLoaded: ensurePageModuleLoadedMock,
        openSettings: openSettingsMock,
    };
}

vi.mock('../utils/pageStyles.js', () => ({
    preloadPageStyles: (page: string) => preloadPageStylesMock(page),
}));

vi.mock('../utils/pageBootstrap.js', () => ({
    pageNeedsDatasetBootstrap: (page: string) => pageNeedsDatasetBootstrapMock(page),
    resolveBackingPageName: (page: string | null | undefined) => (
        page === 'scattermatrix' ? 'scatter' : (page ?? null)
    ),
}));

function buildDom(): void {
    document.body.innerHTML = `
        <div class="app-layout"></div>
        <nav class="sidebar">
            <button class="nav-item" data-page="home" type="button">Home</button>
            <button class="nav-item" data-page="upload" type="button">Upload</button>
            <button class="nav-item" data-page="timeseries" type="button">Timeseries</button>
            <button class="nav-item" data-page="scatter" type="button">Scatter</button>
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
    });

    it('loads the deferred settings subsystem before opening the settings modal', async () => {
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation(navigationDeps());

        await Promise.resolve();

        const homePage = document.querySelector('[data-page-name="home"]') as HTMLElement;
        expect(homePage.hidden).toBe(false);

        (document.querySelector('.nav-item[data-page="settings"]') as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(openSettingsMock).toHaveBeenCalledTimes(1);
        expect(homePage.hidden).toBe(false);
    });

    it('opens the hash-routed page instead of forcing home on initialization', async () => {
        window.history.replaceState(null, '', '#page=timeseries');
        const { initPageNavigation } = await import('./pageNavigation.js');

        initPageNavigation(navigationDeps());
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const homePage = document.querySelector('[data-page-name="home"]') as HTMLElement;
        const timeseriesPage = document.querySelector('[data-page-name="timeseries"]') as HTMLElement;
        expect(homePage.hidden).toBe(true);
        expect(timeseriesPage.hidden).toBe(false);
    });

    it('opens scattermatrix hashes through the shared scatter page with matrix analytics metadata', async () => {
        window.history.replaceState(null, '', '#page=scattermatrix');
        pageNeedsDatasetBootstrapMock.mockImplementation((page) => page === 'scatter');
        const pageChangeHandler = vi.fn();
        window.addEventListener('edatime:page-change', pageChangeHandler);
        const { initPageNavigation } = await import('./pageNavigation.js');

        initPageNavigation(navigationDeps());
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const scatterPage = document.querySelector('[data-page-name="scatter"]') as HTMLElement;
        const homePage = document.querySelector('[data-page-name="home"]') as HTMLElement;

        expect(homePage.hidden).toBe(true);
        expect(scatterPage.hidden).toBe(false);
        expect(pageNeedsDatasetBootstrapMock).toHaveBeenCalledWith('scatter');
        expect(ensureDatasetReadyMock).toHaveBeenCalledWith('scatter');
        expect(ensurePageModuleLoadedMock).toHaveBeenCalledWith('scatter');
        expect(pageChangeHandler).toHaveBeenCalledWith(expect.objectContaining({
            detail: expect.objectContaining({
                page: 'scatter',
                navPage: 'scattermatrix',
                analyticsView: 'matrix',
            }),
        }));
    });

    it('dismisses sticky toasts when navigating to another page', async () => {
        const { initPageNavigation } = await import('./pageNavigation.js');
        const { toast } = await import('../utils/toast.js');

        initPageNavigation(navigationDeps());
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        toast('Upload failed', 'error');
        expect(document.querySelectorAll('.toast')).toHaveLength(1);

        (document.querySelector('.nav-item[data-page="timeseries"]') as HTMLButtonElement).click();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.querySelectorAll('.toast')).toHaveLength(0);
    });
});
