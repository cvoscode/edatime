import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPageLifecycle } from './pageLifecycle.js';

const originalWindow = window;

function dispatchPageChange(page: string) {
    window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page } }));
}

describe('createPageLifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls init once on first page change matching the page', () => {
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init });
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        unregister.dispose();
    });

    it('does not call init again when the same page is visited a second time', () => {
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init });
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        dispatchPageChange('test');
        // init should NOT be called again — it runs once only
        expect(init).toHaveBeenCalledTimes(1);
        unregister.dispose();
    });

    it('does NOT call init when a different page changes first', () => {
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init });
        dispatchPageChange('other');
        expect(init).not.toHaveBeenCalled();
        dispatchPageChange('test'); // now it should fire
        expect(init).toHaveBeenCalledTimes(1);
        unregister.dispose();
    });

    it('calls onVisible when the registered page becomes visible', () => {
        const onVisible = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init() { }, onVisible });
        dispatchPageChange('test');
        expect(onVisible).toHaveBeenCalledTimes(1);
        dispatchPageChange('test');
        // onVisible fires on every activation of the target page
        expect(onVisible).toHaveBeenCalledTimes(2);
        unregister.dispose();
    });

    it('does NOT call onVisible when a different page is active', () => {
        const onVisible = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init() { }, onVisible });
        dispatchPageChange('other');
        expect(onVisible).not.toHaveBeenCalled();
        dispatchPageChange('another');
        expect(onVisible).not.toHaveBeenCalled();
        unregister.dispose();
    });

    it('calls onEveryPageChange on every page change regardless of page', () => {
        const onEveryPageChange = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init() { }, onEveryPageChange });
        dispatchPageChange('test');
        dispatchPageChange('fft');
        dispatchPageChange('heatmap');
        dispatchPageChange('test');
        // 4 page changes → onEveryPageChange called 4 times
        expect(onEveryPageChange).toHaveBeenCalledTimes(4);
        unregister.dispose();
    });

    it('calls onEveryPageChange even before init has fired', () => {
        const onEveryPageChange = vi.fn();
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init, onEveryPageChange });
        dispatchPageChange('other'); // init not called yet, but onEveryPageChange fires
        expect(init).not.toHaveBeenCalled();
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
        dispatchPageChange('test'); // now init fires AND onEveryPageChange fires
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(2);
        unregister.dispose();
    });

    it('dispose removes the listener', () => {
        const onEveryPageChange = vi.fn();
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init, onEveryPageChange });
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);

        unregister.dispose();

        dispatchPageChange('test');
        dispatchPageChange('fft');
        // After disposal, no new calls should happen
        expect(init).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
    });

    it('init can return a cleanup function that is called by dispose', () => {
        const cleanup = vi.fn();
        const init = vi.fn(() => cleanup);
        const unregister = createPageLifecycle({ page: 'test', init });
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        expect(cleanup).not.toHaveBeenCalled();

        unregister.dispose();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('does not retain a cleanup when disposed before first activation', () => {
        const init = vi.fn();
        const unregister = createPageLifecycle({ page: 'test', init });

        unregister.dispose();
        dispatchPageChange('test');

        expect(init).not.toHaveBeenCalled();
    });

    it('onEveryPageChange fires on init page activation too', () => {
        const onEveryPageChange = vi.fn();
        createPageLifecycle({ page: 'test', init() { }, onEveryPageChange });
        dispatchPageChange('test');
        // onEveryPageChange fires alongside init on the same event
        expect(onEveryPageChange).toHaveBeenCalledTimes(1);
    });

    it('onVisible fires alongside init when first activation is the target page', () => {
        const init = vi.fn();
        const onVisible = vi.fn();
        createPageLifecycle({ page: 'test', init, onVisible });
        dispatchPageChange('test');
        expect(init).toHaveBeenCalledTimes(1);
        expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it('activates the target lifecycle locally without dispatching a router event', () => {
        const init = vi.fn();
        const onVisible = vi.fn();
        const onEveryPageChange = vi.fn();
        const lifecycle = createPageLifecycle({ page: 'test', init, onVisible, onEveryPageChange });

        lifecycle.activate();

        expect(init).toHaveBeenCalledTimes(1);
        expect(onVisible).toHaveBeenCalledTimes(1);
        expect(onEveryPageChange).not.toHaveBeenCalled();
        lifecycle.dispose();
    });
});
