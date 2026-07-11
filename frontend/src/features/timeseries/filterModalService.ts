type FilterModalOpener = (column: string | null) => void;

let filterModalOpener: FilterModalOpener | null = null;

export function registerFilterModalOpener(opener: FilterModalOpener | null): void {
    filterModalOpener = opener;
}

export function hasFilterModalOpener(): boolean {
    return filterModalOpener !== null;
}

export function openFilterForColumn(column: string | null): boolean {
    if (!filterModalOpener) return false;
    filterModalOpener(column);
    return true;
}

export function __resetFilterModalOpenerForTests(): void {
    filterModalOpener = null;
}
