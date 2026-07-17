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
        <div class="app-layout" data-sidebar-open="false">
        <nav class="sidebar" id="sidebar">
            <button class="nav-item" data-page="home" type="button">Home</button>
            <button class="nav-item" data-page="upload" type="button">Upload</button>
            <button class="nav-item" data-page="timeseries" type="button">Timeseries</button>
            <button class="nav-item" data-page="scatter" type="button">Scatter</button>
            <button class="nav-item" data-page="settings" type="button">Settings</button>
            <button id="sidebar-collapse-btn" type="button">Collapse</button>
        </nav>
        <button id="mobile-sidebar-backdrop" type="button" hidden>Close</button>
        <button id="mobile-sidebar-toggle-btn" type="button" aria-expanded="false">Menu</button>
        <main class="app-content">
          <section class="page" data-page-name="home"></section>
          <section class="page" data-page-name="upload" hidden></section>
          <section class="page" data-page-name="timeseries" hidden></section>
          <section class="page" data-page-name="scatter" hidden></section>
        </main>
        </div>
    `;
}

describe('initPageNavigation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        buildDom();
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    });

    it('opens and closes the mobile navigation drawer without collapsing app content', async () => {
        vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation(navigationDeps());

        const layout = document.querySelector('.app-layout') as HTMLElement;
        const toggle = document.getElementById('mobile-sidebar-toggle-btn') as HTMLButtonElement;
        toggle.click();

        expect(layout.dataset.sidebarOpen).toBe('true');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(document.querySelector('.app-content')?.hasAttribute('inert')).toBe(true);
        expect(document.body.classList.contains('mobile-nav-open')).toBe(true);

        (document.querySelector('.nav-item[data-page="timeseries"]') as HTMLButtonElement).click();
        await Promise.resolve();

        expect(layout.dataset.sidebarOpen).toBe('false');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('.app-content')?.hasAttribute('inert')).toBe(false);
    });

    it('dismisses the mobile drawer through its real backdrop and restores focus', async () => {
        vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation(navigationDeps());

        const toggle = document.getElementById('mobile-sidebar-toggle-btn') as HTMLButtonElement;
        const backdrop = document.getElementById('mobile-sidebar-backdrop') as HTMLButtonElement;
        toggle.focus();
        toggle.click();
        await Promise.resolve();

        expect(backdrop.hidden).toBe(false);
        expect(document.activeElement).toBe(document.querySelector('.nav-item'));
        backdrop.click();

        expect(backdrop.hidden).toBe(true);
        expect(document.activeElement).toBe(toggle);
    });

    it('traps Tab within the open mobile navigation drawer', async () => {
        vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation(navigationDeps());
        (document.getElementById('mobile-sidebar-toggle-btn') as HTMLButtonElement).click();
        await Promise.resolve();

        const buttons = Array.from(document.querySelectorAll<HTMLElement>('#sidebar button'));
        buttons.at(-1)?.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

        expect(document.activeElement).toBe(buttons[0]);
    });

    it('keeps desktop collapse state separate from the mobile drawer state', async () => {
        const { initPageNavigation } = await import('./pageNavigation.js');
        initPageNavigation(navigationDeps());

        const layout = document.querySelector('.app-layout') as HTMLElement;
        const collapse = document.getElementById('sidebar-collapse-btn') as HTMLButtonElement;
        collapse.click();

        expect(layout.classList.contains('sidebar-collapsed')).toBe(true);
        expect(layout.dataset.sidebarOpen).toBe('false');
        expect(collapse.getAttribute('aria-label')).toBe('Expand sidebar');
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
        const { onNavigationChange } = await import('../platform/navigationEvents.js');
        const unsubscribeNavigation = onNavigationChange(pageChangeHandler);
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
            page: 'scatter', navPage: 'scattermatrix', analyticsView: 'matrix',
        }));
        unsubscribeNavigation();
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

    it('releases navigation button listeners when disposed', async () => {
        const { initPageNavigation } = await import('./pageNavigation.js');
        const navigation = initPageNavigation(navigationDeps());
        await Promise.resolve();
        ensurePageModuleLoadedMock.mockClear();

        navigation.dispose();
        (document.querySelector('.nav-item[data-page="timeseries"]') as HTMLButtonElement).click();
        await Promise.resolve();

        expect(ensurePageModuleLoadedMock).not.toHaveBeenCalled();
    });
});
