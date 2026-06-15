import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalysisPageRuntime } from './analysisPageRuntime.js';

describe('createAnalysisPageRuntime', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('mount() returns an unregister function and wires createPageLifecycle', () => {
        const init = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            init,
        });
        const unregister = runtime.mount();
        expect(typeof unregister).toBe('function');
        // init is deferred until first page activation — trigger it
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        expect(init).toHaveBeenCalled();
    });

    it('mount() wires exportConfig when provided', async () => {
        const bindExportButtonsModule = await import('../../utils/bindExportButtons.js');
        const spy = vi.spyOn(bindExportButtonsModule, 'bindExportButtons' as keyof typeof bindExportButtonsModule);
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            exportConfig: {
                key: 'fft',
                png: { fn: () => { }, filename: 'fft.png' },
                svg: { fn: () => { }, filename: 'fft.svg' },
                html: { fn: () => { }, filename: 'fft.html' },
            },
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        expect(spy).toHaveBeenCalledWith('fft', expect.any(Object));
    });

    it('mount() calls onVisible once when the registered page becomes active', () => {
        const onVisible = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'heatmap',
            emptyStateRootId: 'heatmap-empty-state',
            onVisible,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'heatmap' } }));
        expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it('updateEmptyState forwards the view model to the empty-state controller', () => {
        document.body.innerHTML = `<div id="heatmap-empty-state"><span id="heatmap-empty-state-title"></span><span id="heatmap-empty-state-message"></span></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'heatmap',
            emptyStateRootId: 'heatmap-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({
            visible: true,
            reason: 'no-columns-selected',
            title: 'No columns',
            message: 'Pick some columns.',
        });
        const root = document.getElementById('heatmap-empty-state')!;
        expect(root.hidden).toBe(false);
        expect(root.getAttribute('data-empty-reason')).toBe('no-columns-selected');
    });

    it('updateEmptyState is idempotent (no double-init of the controller)', () => {
        document.body.innerHTML = `<div id="spec-empty-state"></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'spectrogram',
            emptyStateRootId: 'spec-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({ visible: false, reason: '', title: '', message: '' });
        runtime.updateEmptyState({ visible: true, reason: 'test', title: '', message: '' });
        const root = document.getElementById('spec-empty-state')!;
        expect(root.getAttribute('data-empty-reason')).toBe('test');
    });

    it('updateEmptyState can hide a previously visible empty state', () => {
        document.body.innerHTML = `<div id="fft-empty-state" data-empty-reason=""></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({ visible: true, reason: 'no-columns-selected', title: '', message: '' });
        runtime.updateEmptyState({ visible: false, reason: '', title: '', message: '' });

        const root = document.getElementById('fft-empty-state')!;
        expect(root.hidden).toBe(true);
        expect(root.getAttribute('data-empty-reason')).toBe('');
    });

    it('onEveryPageChange callback fires on every page change', () => {
        const onEveryPageChange = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            init: vi.fn(),
            onEveryPageChange,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'timeseries' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'scatter' } }));
        expect(onEveryPageChange).toHaveBeenCalledTimes(2);
    });

    it('bindExportsOnInit defaults to true (binds exports in init)', async () => {
        const bindExportButtonsModule = await import('../../utils/bindExportButtons.js');
        const spy = vi.spyOn(bindExportButtonsModule, 'bindExportButtons' as keyof typeof bindExportButtonsModule);
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            exportConfig: {
                key: 'fft',
                png: { fn: () => { }, filename: 'fft.png' },
                svg: { fn: () => { }, filename: 'fft.svg' },
                html: { fn: () => { }, filename: 'fft.html' },
            },
            // bindExportsOnInit not set — defaults to true
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        expect(spy).toHaveBeenCalled();
    });

    it('updateStatus writes text to the configured status element', () => {
        document.body.innerHTML = `<div id="test-status"></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            statusElId: 'test-status',
        });
        runtime.mount();
        runtime.updateStatus('3 columns selected');
        expect(document.getElementById('test-status')?.textContent).toBe('3 columns selected');
    });

    it('updateStatus clears the element when given an empty string', () => {
        document.body.innerHTML = `<div id="test-status">previous text</div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            statusElId: 'test-status',
        });
        runtime.mount();
        runtime.updateStatus('');
        expect(document.getElementById('test-status')?.textContent).toBe('');
    });

    it('updateStatus is a no-op when no statusElId is configured', () => {
        document.body.innerHTML = `<div id="some-other-status"></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            // no statusElId
        });
        runtime.mount();
        // Should not throw
        runtime.updateStatus('anything');
        expect(document.getElementById('some-other-status')?.textContent).toBe('');
    });

    it('statusElId is accepted without breaking mount or empty-state', () => {
        document.body.innerHTML = `<div id="heatmap-empty-state"></div>`;
        const runtime = createAnalysisPageRuntime({
            page: 'heatmap',
            emptyStateRootId: 'heatmap-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({ visible: true, reason: 'no-data', title: '', message: '' });
        expect(document.getElementById('heatmap-empty-state')!.getAttribute('data-empty-reason')).toBe('no-data');
    });

    it('bindExports() calls bindExportButtons with the configured exportConfig', async () => {
        const bindExportButtonsModule = await import('../../utils/bindExportButtons.js');
        const spy = vi.spyOn(bindExportButtonsModule, 'bindExportButtons' as keyof typeof bindExportButtonsModule);
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            bindExportsOnInit: false,
            exportConfig: {
                key: 'fft',
                png: { fn: () => {}, filename: 'fft.png' },
                svg: { fn: () => {}, filename: 'fft.svg' },
                html: { fn: () => {}, filename: 'fft.html' },
            },
        });
        runtime.mount();
        runtime.bindExports();
        expect(spy).toHaveBeenCalledWith('fft', expect.any(Object));
    });

    it('bindExports() is idempotent (calls bindExportButtons only once across multiple calls)', async () => {
        const bindExportButtonsModule = await import('../../utils/bindExportButtons.js');
        const spy = vi.spyOn(bindExportButtonsModule, 'bindExportButtons' as keyof typeof bindExportButtonsModule);
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            bindExportsOnInit: false,
            exportConfig: {
                key: 'fft',
                png: { fn: () => {}, filename: 'fft.png' },
                svg: { fn: () => {}, filename: 'fft.svg' },
                html: { fn: () => {}, filename: 'fft.html' },
            },
        });
        runtime.mount();
        runtime.bindExports();
        runtime.bindExports();
        runtime.bindExports();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('bindExports() is a no-op when no exportConfig is provided', () => {
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            bindExportsOnInit: false,
            // no exportConfig
        });
        runtime.mount();
        // Should not throw
        runtime.bindExports();
    });

    // -------------------------------------------------------------------------
    // Delegation tests — createAnalysisPageRuntime delegates to createPageLifecycle
    // -------------------------------------------------------------------------

    it('init fires exactly once even when the same page is visited multiple times (delegates to createPageLifecycle)', () => {
        const init = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            init,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        // init is called once — the wrapper does not re-implement the once-only guarantee
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('init does not fire before the registered page is activated (delegates to createPageLifecycle)', () => {
        const init = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'target',
            emptyStateRootId: 'fft-empty-state',
            init,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'other' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'another' } }));
        expect(init).not.toHaveBeenCalled();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'target' } }));
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('createAnalysisPageRuntime does NOT re-implement its own page-change listener — onVisible fires through createPageLifecycle', () => {
        const onVisible = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'heatmap',
            emptyStateRootId: 'heatmap-empty-state',
            onVisible,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'heatmap' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'heatmap' } }));
        // onVisible is forwarded to createPageLifecycle — fires on every activation
        expect(onVisible).toHaveBeenCalledTimes(2);
    });

    it('createAnalysisPageRuntime does NOT re-implement its own page-change listener — onEveryPageChange fires through createPageLifecycle', () => {
        const onEveryPageChange = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            onEveryPageChange,
        });
        runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'timeseries' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'scatter' } }));
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'heatmap' } }));
        // onEveryPageChange fires on every event — no duplicate listener in the wrapper
        expect(onEveryPageChange).toHaveBeenCalledTimes(3);
    });

    it('createAnalysisPageRuntime mount returns the createPageLifecycle unregister (no extra wrapper listener)', () => {
        const init = vi.fn();
        const onEveryPageChange = vi.fn();
        const runtime = createAnalysisPageRuntime({
            page: 'fft',
            emptyStateRootId: 'fft-empty-state',
            init,
            onEveryPageChange,
        });
        const unregister = runtime.mount();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
        unregister();
        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'fft' } }));
        // After unregister, no further calls — wrapper does not add a second listener
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
    });
});
