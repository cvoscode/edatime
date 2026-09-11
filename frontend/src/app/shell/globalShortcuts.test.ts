import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGlobalShortcuts } from './globalShortcuts.js';

let cleanup: (() => void) | undefined;

function createDeps() {
    return {
        showPage: vi.fn(),
        openCommands: vi.fn().mockResolvedValue(undefined),
        openSettings: vi.fn().mockResolvedValue(undefined),
    };
}

afterEach(() => {
    cleanup?.();
    cleanup = undefined;
});

describe('shell global shortcuts', () => {
    it('maps Alt+1 through Alt+8 to the visible sidebar order', () => {
        const deps = createDeps();
        cleanup = createGlobalShortcuts().mount(deps);

        for (const key of ['1', '2', '3', '4', '5', '6', '7', '8']) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }));
        }

        expect(deps.showPage.mock.calls.map(([page]) => page)).toEqual([
            'upload',
            'timeseries',
            'prepare',
            'correlations',
            'fft',
            'spectrogram',
            'causal',
            'drift',
        ]);
    });

    it('opens deferred commands and settings through injected shell actions', async () => {
        const deps = createDeps();
        cleanup = createGlobalShortcuts().mount(deps);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
        await Promise.resolve();

        expect(deps.openCommands).toHaveBeenCalledTimes(1);
        expect(deps.openSettings).toHaveBeenCalledTimes(1);
    });

    it('removes its listener when the owning runtime disposes', () => {
        const first = createDeps();
        cleanup = createGlobalShortcuts().mount(first);
        cleanup?.();

        const second = createDeps();
        cleanup = createGlobalShortcuts().mount(second);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }));

        expect(first.showPage).not.toHaveBeenCalled();
        expect(second.showPage).toHaveBeenCalledWith('upload');
    });

    it('does not let one shell instance suppress another shortcut controller', () => {
        const first = createDeps();
        const second = createDeps();
        const firstCleanup = createGlobalShortcuts().mount(first);
        cleanup = createGlobalShortcuts().mount(second);

        firstCleanup();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }));

        expect(first.showPage).not.toHaveBeenCalled();
        expect(second.showPage).toHaveBeenCalledWith('upload');
    });
});
