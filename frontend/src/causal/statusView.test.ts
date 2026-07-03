import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('causal statusView', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        document.body.innerHTML = `
            <section id="page-causal"></section>
            <section id="page-drift"></section>
        `;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('dismisses a causal error toast when navigation leaves the causal page', async () => {
        const { setStatus } = await import('./statusView.js');

        setStatus('Select at least 2 numeric columns before computing a causal graph.', 'error');
        expect(document.querySelector('.toast')).toBeTruthy();

        window.dispatchEvent(new CustomEvent('edatime:page-change', { detail: { page: 'drift' } }));
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(300);

        expect(document.querySelector('.toast')).toBeFalsy();
    });
});
