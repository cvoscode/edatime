import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageRuntime } from './pageRuntime.js';

// Shared helper to dispatch a page-change event
function dispatchPageChange(page: string) {
    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page } }));
}

describe('createPageRuntime', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Contract item 1 — init runs exactly once even with multiple page changes
    // to the same page
    // -----------------------------------------------------------------------
    it('init fires once when page is activated multiple times', () => {
        const init = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init });
        runtime.mount();
        dispatchPageChange('test');
        dispatchPageChange('test');
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('init does not fire for other pages before the target page', () => {
        const init = vi.fn();
        const runtime = createPageRuntime({ page: 'target', init });
        runtime.mount();
        dispatchPageChange('other');
        dispatchPageChange('another');
        expect(init).not.toHaveBeenCalled();
        dispatchPageChange('target');
        expect(init).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Contract item 2 — onVisible fires each time the registered page becomes
    // visible
    // -----------------------------------------------------------------------
    it('onVisible fires each time the registered page becomes visible', () => {
        const onVisible = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init() {}, onVisible });
        runtime.mount();
        dispatchPageChange('test');
        dispatchPageChange('test');
        dispatchPageChange('test');
        // onVisible fires on every activation of the target page
        expect(onVisible).toHaveBeenCalledTimes(3);
    });

    it('onVisible does not fire when a different page is active', () => {
        const onVisible = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init() {}, onVisible });
        runtime.mount();
        dispatchPageChange('other');
        dispatchPageChange('another');
        expect(onVisible).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Contract item 3 — onEveryPageChange fires on EVERY page-change event
    // regardless of target page
    // -----------------------------------------------------------------------
    it('onEveryPageChange fires on every page-change event regardless of target page', () => {
        const onEveryPageChange = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init() {}, onEveryPageChange });
        runtime.mount();
        dispatchPageChange('test');
        dispatchPageChange('fft');
        dispatchPageChange('heatmap');
        dispatchPageChange('scatter');
        expect(onEveryPageChange).toHaveBeenCalledTimes(4);
    });

    it('onEveryPageChange fires even before init has fired', () => {
        const init = vi.fn();
        const onEveryPageChange = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init, onEveryPageChange });
        runtime.mount();
        dispatchPageChange('other');
        // init not called yet, but onEveryPageChange still fires
        expect(init).not.toHaveBeenCalled();
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Contract item 4 — updateStatus(text) sets textContent on element with
    // id = statusElId
    // -----------------------------------------------------------------------
    it('updateStatus sets textContent on the configured status element', () => {
        document.body.innerHTML = `<div id="test-status"></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            statusElId: 'test-status',
        });
        runtime.mount();
        runtime.updateStatus('3 columns loaded');
        expect(document.getElementById('test-status')?.textContent).toBe('3 columns loaded');
    });

    it('updateStatus clears textContent when given an empty string', () => {
        document.body.innerHTML = `<div id="test-status">previous text</div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            statusElId: 'test-status',
        });
        runtime.mount();
        runtime.updateStatus('');
        expect(document.getElementById('test-status')?.textContent).toBe('');
    });

    it('updateStatus is a no-op when no statusElId is configured', () => {
        document.body.innerHTML = `<div id="other-status"></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            // no statusElId
        });
        runtime.mount();
        // Should not throw
        runtime.updateStatus('anything');
        expect(document.getElementById('other-status')?.textContent).toBe('');
    });

    // -----------------------------------------------------------------------
    // Contract item 5 — setLoading(bool) toggles hidden attribute on element
    // with id = loadingElId
    // -----------------------------------------------------------------------
    it('setLoading(true) hides the loading element', () => {
        document.body.innerHTML = `<div id="test-loading"></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            loadingElId: 'test-loading',
        });
        runtime.mount();
        runtime.setLoading(true);
        expect(document.getElementById('test-loading')?.hidden).toBe(true);
    });

    it('setLoading(false) reveals the loading element', () => {
        document.body.innerHTML = `<div id="test-loading" hidden></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            loadingElId: 'test-loading',
        });
        runtime.mount();
        runtime.setLoading(false);
        expect(document.getElementById('test-loading')?.hidden).toBe(false);
    });

    it('setLoading is a no-op when no loadingElId is configured', () => {
        document.body.innerHTML = `<div id="other-loading"></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            // no loadingElId
        });
        runtime.mount();
        // Should not throw
        runtime.setLoading(true);
        runtime.setLoading(false);
    });

    // -----------------------------------------------------------------------
    // Contract item 6 — updateEmptyState lazy-creates EmptyStateController on
    // first call
    // -----------------------------------------------------------------------
    it('updateEmptyState lazy-creates the EmptyStateController on first call', () => {
        document.body.innerHTML = `<div id="test-empty-state"><span id="test-empty-state-title"></span><span id="test-empty-state-message"></span></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
        });
        runtime.mount();
        // No empty-state controller exists before updateEmptyState is called
        runtime.updateEmptyState({
            visible: true,
            reason: 'no-columns-selected',
            title: 'No columns',
            message: 'Pick some columns.',
        });
        const root = document.getElementById('test-empty-state')!;
        expect(root.hidden).toBe(false);
        expect(root.getAttribute('data-empty-reason')).toBe('no-columns-selected');
    });

    it('updateEmptyState is idempotent — no double-init of the controller', () => {
        document.body.innerHTML = `<div id="test-empty-state"></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({ visible: false, reason: '', title: '', message: '' });
        runtime.updateEmptyState({ visible: true, reason: 'test', title: '', message: '' });
        const root = document.getElementById('test-empty-state')!;
        expect(root.getAttribute('data-empty-reason')).toBe('test');
    });

    it('updateEmptyState can hide a previously visible empty state', () => {
        document.body.innerHTML = `<div id="test-empty-state" data-empty-reason=""></div>`;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
        });
        runtime.mount();
        runtime.updateEmptyState({ visible: true, reason: 'no-columns-selected', title: '', message: '' });
        runtime.updateEmptyState({ visible: false, reason: '', title: '', message: '' });
        const root = document.getElementById('test-empty-state')!;
        expect(root.hidden).toBe(true);
        expect(root.getAttribute('data-empty-reason')).toBe('');
    });

    // -----------------------------------------------------------------------
    // Contract item 7 — mount() returns an unregister cleanup function
    // -----------------------------------------------------------------------
    it('mount() returns a function that removes all listeners', () => {
        const init = vi.fn();
        const onEveryPageChange = vi.fn();
        const runtime = createPageRuntime({ page: 'test', init, onEveryPageChange });
        const unregister = runtime.mount();
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
        unregister();
        dispatchPageChange('test');
        dispatchPageChange('fft');
        // After cleanup, no new calls
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
    });

    it('unregister also calls the cleanup returned by init', () => {
        const cleanup = vi.fn();
        const init = vi.fn(() => cleanup);
        const runtime = createPageRuntime({ page: 'test', init });
        const unregister = runtime.mount();
        dispatchPageChange('test');
        expect(cleanup).not.toHaveBeenCalled();
        unregister(); // call the unregister returned by mount
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('mount() is idempotent — calling twice only registers one listener', () => {
        const onEveryPageChange = vi.fn();
        const init = vi.fn();
        const runtime = createPageRuntime({
            page: 'test',
            init,
            onEveryPageChange,
        });
        const un1 = runtime.mount();
        const un2 = runtime.mount();
        dispatchPageChange('test');
        dispatchPageChange('test');
        // Only one listener registered — init and onEveryPageChange each fire once per event
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(2);
        un1();
        dispatchPageChange('test');
        // After unregister, no further calls (both listeners removed by first unregister)
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(2);
        // un2 is a no-op since mount was already called
        un2();
    });

    it('statusElId is accepted alongside loadingElId without conflict', () => {
        document.body.innerHTML = `
            <div id="test-status"></div>
            <div id="test-loading" hidden></div>
        `;
        const runtime = createPageRuntime({
            page: 'test',
            emptyStateRootId: 'test-empty-state',
            statusElId: 'test-status',
            loadingElId: 'test-loading',
        });
        runtime.mount();
        runtime.updateStatus('ready');
        runtime.setLoading(false);
        expect(document.getElementById('test-status')?.textContent).toBe('ready');
        expect(document.getElementById('test-loading')?.hidden).toBe(false);
    });
});