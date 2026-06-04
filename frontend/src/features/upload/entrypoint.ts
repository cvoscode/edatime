/**
 * Upload feature entrypoint.
 *
 * Composes all upload sub-modules:
 *   fileSource.ts      — file selection, drag/drop, upload submit
 *   databaseSource.ts  — connect, load, disconnect
 *   preview.ts         — preview controller, status display
 *   partialLoadControls.ts — n_rows, skip_rows, time_start, time_end controls
 *
 * ui/upload.ts remains the rendering surface (DOM manipulation, event binding).
 * This module owns workflow logic and state transitions.
 */
import type { DatasetMetadata } from '../../types.js';

export interface UploadFeatureDeps {
    buildColumnToggles: () => void;
    buildRangeControls: () => void;
}

// Internal init function type (matches ui/upload.ts signature)
type InitUploadPanelFn = (
    hydrateColumnProfiles: (metadata: DatasetMetadata) => void,
    renderColumnProfilesGrid: (resetScroll: boolean) => void,
    deps: { buildColumnToggles: () => void; buildRangeControls: () => void },
) => void;

export function createUploadEntrypoint(deps: UploadFeatureDeps) {
    let initialized = false;
    // Lazily resolved init function (set by tests via mockOverride)
    let mockInitUploadPanel: InitUploadPanelFn | null = null;

    return {
        async init(
            hydrateColumnProfiles: (metadata: DatasetMetadata) => void,
            renderColumnProfilesGrid: (resetScroll: boolean) => void,
        ) {
            if (initialized) return;
            initialized = true;

            if (mockInitUploadPanel) {
                mockInitUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid, {
                    buildColumnToggles: deps.buildColumnToggles,
                    buildRangeControls: deps.buildRangeControls,
                });
                return;
            }

            const { initUploadPanel } = await import('../../ui/upload.js');
            initUploadPanel(hydrateColumnProfiles, renderColumnProfilesGrid, {
                buildColumnToggles: deps.buildColumnToggles,
                buildRangeControls: deps.buildRangeControls,
            });
        },

        /** For testing only — allows injecting a mock initUploadPanel */
        _setMock(fn: InitUploadPanelFn | null) {
            mockInitUploadPanel = fn;
        },
    };
}