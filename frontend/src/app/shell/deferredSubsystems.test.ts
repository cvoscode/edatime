import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    initSettingsPanel: vi.fn(),
    openSettingsModal: vi.fn(),
    initCommandPalette: vi.fn(),
    openPalette: vi.fn(),
    registerAppCommands: vi.fn(),
}));

vi.mock('../../ui/settingsPanel.js', () => ({
    initSettingsPanel: mocks.initSettingsPanel,
    openSettingsModal: mocks.openSettingsModal,
}));
vi.mock('../../utils/palette.js', () => ({
    initCommandPalette: mocks.initCommandPalette,
    openPalette: mocks.openPalette,
}));
vi.mock('../../bootstrap/commands.js', () => ({ registerAppCommands: mocks.registerAppCommands }));

import {
    _resetDeferredSubsystems,
    ensureCommands,
    ensureSettingsPanel,
    type DeferredShellDeps,
} from './deferredSubsystems.js';

function createDeps(): DeferredShellDeps {
    return {
        showPage: vi.fn(),
        ensurePageModuleLoaded: vi.fn(),
        fetchAndRender: vi.fn(),
        refreshDatasetAfterMutation: vi.fn(async () => {}),
        buildTimeseriesColumns: vi.fn(),
        buildTimeseriesRanges: vi.fn(),
        zoomOut: vi.fn(),
        resetZoom: vi.fn(),
        updateAnalysisYRange: vi.fn(),
        registerCleanup: vi.fn(),
    };
}

describe('deferred shell subsystems', () => {
    afterEach(() => {
        _resetDeferredSubsystems();
        mocks.initSettingsPanel.mockClear();
        mocks.openSettingsModal.mockClear();
        mocks.initCommandPalette.mockClear();
        mocks.openPalette.mockClear();
        mocks.registerAppCommands.mockClear();
        Reflect.deleteProperty(window, '__edatime');
    });

    it('initializes the settings panel once and exposes its opener after it loads', async () => {
        const deps = createDeps();
        await Promise.all([ensureSettingsPanel(deps), ensureSettingsPanel(deps)]);

        expect(mocks.initSettingsPanel).toHaveBeenCalledTimes(1);
        expect((window as Window & { __edatime?: { openSettingsModal?: () => void } }).__edatime?.openSettingsModal)
            .toBe(mocks.openSettingsModal);
    });

    it('loads command dependencies once and forwards only the command dependencies they need', async () => {
        const deps = createDeps();
        await ensureCommands(deps);
        await ensureCommands(deps);

        expect(mocks.initCommandPalette).toHaveBeenCalledTimes(1);
        expect(mocks.registerAppCommands).toHaveBeenCalledTimes(1);
        expect(mocks.registerAppCommands).toHaveBeenCalledWith({
            showPage: deps.showPage,
            zoomOut: deps.zoomOut,
            resetZoom: deps.resetZoom,
        });
        expect((window as Window & { __edatime?: { openPalette?: () => void } }).__edatime?.openPalette)
            .toBe(mocks.openPalette);
    });
});
