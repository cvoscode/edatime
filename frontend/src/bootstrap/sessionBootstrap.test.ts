import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    configureSessionWorkspace: vi.fn(),
    initAutoSave: vi.fn(),
}));

vi.mock('../utils/router.js', () => ({
    getHashPage: vi.fn(() => ''),
}));

vi.mock('../utils/session.js', () => ({
    applySession: vi.fn(),
    autoRestoreSession: vi.fn(() => null),
    configureSessionWorkspace: mocks.configureSessionWorkspace,
    initAutoSave: mocks.initAutoSave,
}));

describe('startSessionPersistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as any).__edatime;
    });

    it('configures the workspace and starts autosave without publishing window commands', async () => {
        const { startSessionPersistence } = await import('./sessionBootstrap.js');
        const workspace = {
            getSnapshot: vi.fn(),
            setSelection: vi.fn(),
            setFilters: vi.fn(),
            setViewport: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
        };

        startSessionPersistence(workspace);

        expect(mocks.configureSessionWorkspace).toHaveBeenCalledWith(workspace);
        expect(mocks.initAutoSave).toHaveBeenCalledTimes(1);
        expect((window as any).__edatime).toBeUndefined();
    });
});
