import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from './toast';

describe('toast controller', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('renders the shared container as a top-right stack', () => {
        toast('Dataset ready', 'success');

        const container = document.querySelector('.toast-container');
        expect(container).not.toBeNull();
        expect(container?.getAttribute('data-position')).toBe('top-right');
    });

    it('keeps error toasts sticky by default', () => {
        toast('Upload failed', 'error');

        vi.advanceTimersByTime(10_000);

        expect(document.querySelectorAll('.toast').length).toBe(1);
    });

    it('refreshes duplicates instead of stacking identical toasts', () => {
        toast('Session restored', 'success');
        toast('Session restored', 'success');

        expect(document.querySelectorAll('.toast').length).toBe(1);
    });
});
