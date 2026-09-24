/** Upload's adapter around the shared column-profile grid. */

import {
    createProfileGridController,
    renderProfileGrid,
    profileRowsFromMetadata,
    type ProfileGridController,
    type ProfileGridOptions,
} from '../../ui/profileGrid.js';
import { uploadProfile, setColumnProfiles } from './profileState.js';
import {
    setPreviewSelectedColumns,
    setProfileGridBound,
    setProfileGridColWidths,
    setProfileGridHeaderBound,
    setProfileGridSort,
    uploadUi,
} from './uploadUi.js';
import type { ProfileRow } from '../../types/store.js';
import type { DatasetMetadata } from '../../types/api.js';

export { sortProfileRows } from '../../ui/profileGrid.js';

export function hydrateColumnProfiles(metadata: DatasetMetadata): void {
    setColumnProfiles(profileRowsFromMetadata(metadata));
    invalidateProfileGridViewModel();
}

function getSelectablePreviewColumns(profiles: readonly ProfileRow[] = uploadProfile.columnProfiles): string[] {
    return profiles
        .map((profile) => profile.name)
        .filter((name) => name && name !== uploadUi.previewTimeColumn);
}

export function formatUploadSelectionStatus(
    selectableCount: number,
    selectedCount: number,
    timeColumnName: string | null,
): string {
    const analysisCount = Math.max(0, Number(selectableCount) || 0);
    const chosenCount = Math.max(0, Math.min(analysisCount, Number(selectedCount) || 0));
    if (analysisCount === 0 && !timeColumnName) {
        return 'Preview columns will appear here after file analysis.';
    }
    if (analysisCount === 0) {
        return `Time column detected: ${timeColumnName}. No additional analysis columns available.`;
    }
    if (timeColumnName && chosenCount === analysisCount) {
        return `Time column ${timeColumnName} plus all ${analysisCount} analysis columns are selected.`;
    }
    if (timeColumnName) {
        return `Time column ${timeColumnName} plus ${chosenCount} of ${analysisCount} analysis columns selected.`;
    }
    return `${chosenCount} of ${analysisCount} analysis columns selected.`;
}

function syncUploadSelectionUI(profiles: readonly ProfileRow[] = uploadProfile.columnProfiles): void {
    const allCheckbox = document.getElementById('profile-select-all-checkbox') as HTMLInputElement | null;
    const selectable = getSelectablePreviewColumns(profiles);
    const selected = new Set(uploadUi.previewSelectedColumns);
    const selectedCount = selectable.filter((name) => selected.has(name)).length;

    if (allCheckbox) {
        allCheckbox.checked = selectable.length > 0 && selectedCount === selectable.length;
        allCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
    }
}

function uploadGridOptions(): ProfileGridOptions | null {
    const root = document.getElementById('profile-grid');
    if (!root) return null;
    return {
        root,
        getProfiles: () => uploadProfile.columnProfiles,
        selectable: true,
        getFilterText: () => uploadUi.profileFilterText,
        getFilterCategory: () => uploadUi.profileFilterCategory,
        getSort: () => uploadUi.profileGridSort,
        setSort: setProfileGridSort,
        getColumnWidths: () => uploadUi.profileGridColWidths,
        setColumnWidths: setProfileGridColWidths,
        getSelectedColumns: () => uploadUi.previewSelectedColumns,
        getTimeColumn: () => uploadUi.previewTimeColumn,
        onSelectionChange: (columns) => {
            setPreviewSelectedColumns(columns);
            syncUploadSelectionUI();
        },
        ariaLabel: 'Column profile table',
        caption: 'Column profile preview with selectable columns for upload ingestion.',
    };
}

let profileGridController: ProfileGridController | null = null;
let disposeProfileGrid: (() => void) | null = null;

export function invalidateProfileGridViewModel(): void {
    profileGridController?.invalidate();
}

export function renderColumnProfilesGrid(resetScroll = false): void {
    const options = uploadGridOptions();
    if (!options) return;
    if (profileGridController) profileGridController.render(resetScroll);
    else renderProfileGrid(options, resetScroll);
    syncUploadSelectionUI();
}

export function initColumnProfilesGrid(): () => void {
    if (disposeProfileGrid) return disposeProfileGrid;
    const options = uploadGridOptions();
    if (!options || !options.root.querySelector('.profile-grid-viewport')) return () => {};

    profileGridController = createProfileGridController(options);
    setProfileGridBound(true);
    setProfileGridHeaderBound(true);
    profileGridController.render(false);
    syncUploadSelectionUI();

    const dispose = () => {
        profileGridController?.dispose();
        profileGridController = null;
        if (disposeProfileGrid === dispose) disposeProfileGrid = null;
        setProfileGridBound(false);
        setProfileGridHeaderBound(false);
        invalidateProfileGridViewModel();
    };
    disposeProfileGrid = dispose;
    return dispose;
}
