import type { ProfileGridSort } from '../../types/store.js';

export type ProfileFilterCategory = 'all' | 'numeric' | 'datetime';

/** UI state owned by the upload profile grid. */
interface UploadUiState {
    profileFilterText: string;
    profileFilterCategory: ProfileFilterCategory;
    previewSelectedColumns: string[];
    previewTimeColumn: string | null;
    profileGridBound: boolean;
    profileGridHeaderBound: boolean;
    profileGridSort: ProfileGridSort;
    profileGridColWidths: number[];
}

export const uploadUi: UploadUiState = {
    profileFilterText: '',
    profileFilterCategory: 'all',
    previewSelectedColumns: [],
    previewTimeColumn: null,
    profileGridBound: false,
    profileGridHeaderBound: false,
    profileGridSort: { key: 'name', dir: 'asc' },
    profileGridColWidths: [56, 220, 120, 140, 100, 130, 130, 260],
};

export function setProfileFilterText(text: string): void {
    uploadUi.profileFilterText = text;
}

export function setProfileFilterCategory(category: ProfileFilterCategory): void {
    const normalized: ProfileFilterCategory = (['all', 'numeric', 'datetime'] as const).includes(category)
        ? category
        : 'all';
    uploadUi.profileFilterCategory = normalized;
}

export function setPreviewSelectedColumns(cols: string[]): void {
    uploadUi.previewSelectedColumns = [...cols];
}

export function setPreviewTimeColumn(col: string | null): void {
    uploadUi.previewTimeColumn = col;
}

export function setProfileGridSort(sort: ProfileGridSort): void {
    uploadUi.profileGridSort = { ...sort };
}

export function setProfileGridColWidths(widths: number[]): void {
    uploadUi.profileGridColWidths = [...widths];
}

export function setProfileGridBound(bound: boolean): void {
    uploadUi.profileGridBound = bound;
}

export function setProfileGridHeaderBound(bound: boolean): void {
    uploadUi.profileGridHeaderBound = bound;
}
