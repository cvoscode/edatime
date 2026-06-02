import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createUploadEntrypoint } from './entrypoint.js';

const initUploadPanelMock = vi.fn();

describe('createUploadEntrypoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        initUploadPanelMock.mockImplementation(() => { });
    });

    it('returns an explicit init surface', () => {
        const deps = {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        };
        const entrypoint = createUploadEntrypoint(deps);
        expect(entrypoint.init).toBeTypeOf('function');
    });

    it('does not call initUploadPanel before init', () => {
        const deps = {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        };
        const entrypoint = createUploadEntrypoint(deps);
        // Before init, the mock should not have been called
        expect(initUploadPanelMock).not.toHaveBeenCalled();
    });

    it('init calls initUploadPanel with hydrateColumnProfiles, renderColumnProfilesGrid, and deps', () => {
        const buildColumnToggles = vi.fn();
        const buildRangeControls = vi.fn();
        const hydrateColumnProfiles = vi.fn();
        const renderColumnProfilesGrid = vi.fn();
        const deps = { buildColumnToggles, buildRangeControls };

        const entrypoint = createUploadEntrypoint(deps);
        entrypoint._setMock(initUploadPanelMock as any);
        entrypoint.init(hydrateColumnProfiles, renderColumnProfilesGrid);

        expect(initUploadPanelMock).toHaveBeenCalledWith(
            hydrateColumnProfiles,
            renderColumnProfilesGrid,
            { buildColumnToggles, buildRangeControls },
        );
    });

    it('init only calls initUploadPanel once on repeated calls', () => {
        const deps = {
            buildColumnToggles: vi.fn(),
            buildRangeControls: vi.fn(),
        };
        const entrypoint = createUploadEntrypoint(deps);
        entrypoint._setMock(initUploadPanelMock as any);
        entrypoint.init(vi.fn(), vi.fn());
        entrypoint.init(vi.fn(), vi.fn());
        expect(initUploadPanelMock).toHaveBeenCalledTimes(1);
    });
});