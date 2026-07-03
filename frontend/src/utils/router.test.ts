import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDom(): void {
    document.body.innerHTML = `
        <nav class="sidebar">
            <button class="nav-item" data-page="home" type="button">Home</button>
            <button class="nav-item" data-page="upload" type="button">Upload</button>
            <button class="nav-item" data-page="timeseries" type="button">Timeseries</button>
            <button class="nav-item" data-page="heatmap" type="button">Correlations</button>
            <button class="nav-item" data-page="scatter" type="button">Scatter</button>
            <button class="nav-item" data-page="fft" type="button">FFT</button>
            <button class="nav-item" data-page="spectrogram" type="button">Spectrogram</button>
            <button class="nav-item" data-page="causal" type="button">Causal</button>
            <button class="nav-item" data-page="drift" type="button">Drift</button>
        </nav>
        <section class="page" data-page-name="home"></section>
        <section class="page" data-page-name="upload" hidden></section>
        <section class="page" data-page-name="timeseries" hidden></section>
        <section class="page" data-page-name="heatmap" hidden></section>
        <section class="page" data-page-name="scatter" hidden></section>
        <section class="page" data-page-name="fft" hidden></section>
        <section class="page" data-page-name="spectrogram" hidden></section>
        <section class="page" data-page-name="causal" hidden></section>
        <section class="page" data-page-name="drift" hidden></section>
    `;
}

describe('hash router valid pages', () => {
    beforeEach(() => {
        vi.resetModules();
        buildDom();
        window.history.replaceState(null, '', '#');
        (window as typeof globalThis & { __edatime?: Record<string, unknown> }).__edatime = {};
    });

    it('accepts drift as a valid hash-routed page', async () => {
        const { getHashPage } = await import('./router.js');
        window.history.replaceState(null, '', '#page=drift');

        expect(getHashPage()).toBe('drift');
    });

    it('keeps scattermatrix as a first-class hash-routed page', async () => {
        const { getHashPage } = await import('./router.js');
        window.history.replaceState(null, '', '#page=scattermatrix');

        expect(getHashPage()).toBe('scattermatrix');
    });

    it('rejects unknown hash-routed pages', async () => {
        const { getHashPage } = await import('./router.js');
        window.history.replaceState(null, '', '#page=unknown');

        expect(getHashPage()).toBeNull();
    });

    it('replaces the hash instead of accumulating page entries while walking the sidebar', async () => {
        const { initPageNavigation } = await import('../ui/pageNavigation.js');
        const { initHashRouting } = await import('./router.js');

        initPageNavigation();
        initHashRouting();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const walk: Array<[string, string]> = [
            ['timeseries', '#page=timeseries'],
            ['heatmap', '#page=heatmap'],
            ['scatter', '#page=scatter'],
            ['fft', '#page=fft'],
            ['spectrogram', '#page=spectrogram'],
            ['causal', '#page=causal'],
            ['drift', '#page=drift'],
            ['upload', '#page=upload'],
        ];

        for (const [page, expectedHash] of walk) {
            (document.querySelector(`.nav-item[data-page="${page}"]`) as HTMLButtonElement).click();
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 0));
            const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            expect(params.getAll('page')).toHaveLength(1);
            expect(window.location.hash).toBe(expectedHash);
        }
    });
});
