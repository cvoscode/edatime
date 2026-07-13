import type { ProfileColumnDef } from '../../types/store.js';

export const PROFILE_ROW_HEIGHT = 38;
export const PROFILE_OVERSCAN = 8;
export const PROFILE_COLUMNS: ProfileColumnDef[] = [
    { key: 'selected', label: '', minWidth: 56, defaultWidth: 56, sortable: false },
    { key: 'name', label: 'Name', minWidth: 160, defaultWidth: 220, sortable: true },
    { key: 'dtype', label: 'Type', minWidth: 110, defaultWidth: 120, sortable: true },
    { key: 'nonNullCount', label: 'Non-Null', minWidth: 130, defaultWidth: 140, sortable: true },
    { key: 'nullCount', label: 'Null', minWidth: 90, defaultWidth: 100, sortable: true },
    { key: 'min', label: 'Min', minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'max', label: 'Max', minWidth: 120, defaultWidth: 130, sortable: true },
    { key: 'histCounts', label: 'Distribution', minWidth: 220, defaultWidth: 260, sortable: false },
];

export function getDefaultProfileColumnWidths(): number[] {
    return PROFILE_COLUMNS.map((col) => col.defaultWidth);
}
