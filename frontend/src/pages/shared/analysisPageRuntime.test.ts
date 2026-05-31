import { describe, expect, it, vi } from 'vitest';
import { createAnalysisPageRuntime } from './analysisPageRuntime.js';

describe('createAnalysisPageRuntime', () => {
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
});