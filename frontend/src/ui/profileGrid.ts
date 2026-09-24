import {
    PROFILE_COLUMNS,
    PROFILE_OVERSCAN,
    PROFILE_ROW_HEIGHT,
    getDefaultProfileColumnWidths,
} from '../services/profile/profile.js';
import {
    formatCount,
    formatProfileValue,
    formatProfileValueTitle,
    isTemporalDtype,
    normalizeDtypeLabel,
    toFiniteNumberOrNull,
} from '../utils/format.js';
import type { DatasetMetadata } from '../contracts/api/v1/dataset.js';
import type { ProfileColumnDef, ProfileGridSort, ProfileRow } from '../types/store.js';
import { bindProfileFilterCategoryControls } from './profileFilters.js';
import type { ProfileFilterCategory } from './profileFilters.js';

export type { ProfileFilterCategory } from './profileFilters.js';

export interface ProfileGridOptions {
    root: HTMLElement;
    getProfiles: () => readonly ProfileRow[];
    selectable?: boolean;
    getFilterText?: () => string;
    getFilterCategory?: () => ProfileFilterCategory;
    getSort?: () => ProfileGridSort;
    setSort?: (sort: ProfileGridSort) => void;
    getColumnWidths?: () => readonly number[];
    setColumnWidths?: (widths: number[]) => void;
    getSelectedColumns?: () => readonly string[];
    getTimeColumn?: () => string | null;
    onSelectionChange?: (columns: string[]) => void;
    ariaLabel?: string;
    caption?: string;
    emptyMessage?: string;
};

export interface ProfileGridController {
    render(resetScroll?: boolean): void;
    invalidate(): void;
    dispose(): void;
}

export interface ProfileFilterControlsOptions {
    inputId: string;
    filterText?: string;
    filterCategory?: ProfileFilterCategory;
    onFilterTextChange: (value: string) => void;
    onFilterCategoryChange: (category: ProfileFilterCategory) => void;
}

const PROFILE_GRID_LABELS: Record<string, string> = {
    selected: '',
    name: 'Column',
    dtype: 'Type',
    nonNullCount: 'Non-null',
    nullCount: 'Nulls',
    min: 'Min',
    max: 'Max',
    histCounts: 'Distribution',
};

function valueAt(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
}

function createProfileRow(raw: unknown): ProfileRow | null {
    const name = String(valueAt(raw, 'name') || '').trim();
    if (!name) return null;

    const histogram = valueAt(raw, 'histogram');
    const rawCounts = valueAt(histogram, 'counts');
    const counts: number[] = Array.isArray(rawCounts)
        ? rawCounts.map((count: unknown) => Math.max(0, Number(count) || 0))
        : [];

    return {
        name,
        dtype: String(valueAt(raw, 'dtype') || ''),
        nonNullCount: Math.max(0, Number(valueAt(raw, 'non_null_count')) || 0),
        nullCount: Math.max(0, Number(valueAt(raw, 'null_count')) || 0),
        min: toFiniteNumberOrNull(valueAt(raw, 'min')),
        max: toFiniteNumberOrNull(valueAt(raw, 'max')),
        histCounts: counts,
        profilePending: false,
    };
}

function createProfileStub(column: { name?: string | null; dtype?: string | null }): ProfileRow | null {
    const name = String(column?.name || '').trim();
    if (!name) return null;

    return {
        name,
        dtype: String(column?.dtype || ''),
        nonNullCount: 0,
        nullCount: 0,
        min: null,
        max: null,
        histCounts: [],
        profilePending: true,
    };
}

/** Convert any dataset metadata response into the rows used by the shared grid. */
export function profileRowsFromMetadata(metadata: DatasetMetadata | null | undefined): ProfileRow[] {
    const incoming = Array.isArray(metadata?.column_profiles) ? metadata.column_profiles : [];
    const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const profileByName = new Map<string, ProfileRow>();

    for (const raw of incoming) {
        const profile = createProfileRow(raw);
        if (profile) profileByName.set(profile.name, profile);
    }

    for (const column of columns) {
        const profile = createProfileStub(column);
        if (!profile || profileByName.has(profile.name)) continue;
        profileByName.set(profile.name, profile);
    }

    return Array.from(profileByName.values());
}

function compareProfileValues(left: unknown, right: unknown, direction: 1 | -1): number {
    const leftValue = String(left || '').toLowerCase();
    const rightValue = String(right || '').toLowerCase();
    if (leftValue < rightValue) return -1 * direction;
    if (leftValue > rightValue) return 1 * direction;
    return 0;
}

export function sortProfileRows(
    profiles: ProfileRow[],
    sortKey: string | null | undefined,
    sortDir: 'asc' | 'desc' | null | undefined,
): ProfileRow[] {
    const sortable = new Set(PROFILE_COLUMNS.filter((column) => column.sortable).map((column) => column.key));
    if (!sortKey || !sortable.has(sortKey)) return profiles;

    const direction: 1 | -1 = sortDir === 'desc' ? -1 : 1;
    return profiles.sort((leftRow, rightRow) => {
        const leftValue: unknown = leftRow[sortKey];
        const rightValue: unknown = rightRow[sortKey];

        if (sortKey === 'name' || sortKey === 'dtype') {
            return compareProfileValues(leftValue, rightValue, direction);
        }

        const leftNumber = Number(leftValue);
        const rightNumber = Number(rightValue);
        const leftFinite = Number.isFinite(leftNumber);
        const rightFinite = Number.isFinite(rightNumber);
        if (!leftFinite && !rightFinite) return 0;
        if (!leftFinite) return 1;
        if (!rightFinite) return -1;
        return (leftNumber - rightNumber) * direction;
    });
}

function filteredProfileRows(
    profiles: readonly ProfileRow[],
    filterText: string,
    filterCategory: ProfileFilterCategory,
    sort: ProfileGridSort,
): ProfileRow[] {
    const query = filterText.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
        if (query && !profile.name.toLowerCase().includes(query) && !profile.dtype.toLowerCase().includes(query)) return false;
        if (filterCategory === 'numeric') return !isTemporalDtype(profile.dtype);
        if (filterCategory === 'datetime') return isTemporalDtype(profile.dtype);
        return true;
    });
    return sortProfileRows(filtered, sort.key, sort.dir);
}

function profileColumns(selectable: boolean): ProfileColumnDef[] {
    return selectable ? PROFILE_COLUMNS : PROFILE_COLUMNS.slice(1);
}

function createProfileCell(text: string, extraClass = ''): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = `profile-cell ${extraClass}`.trim();
    cell.textContent = text;
    return cell;
}

function createHistogramCell(profile: ProfileRow): HTMLDivElement {
    const cell = createProfileCell('');

    if (profile.profilePending) {
        const pending = document.createElement('span');
        pending.className = 'profile-hist-empty';
        pending.textContent = 'Pending';
        cell.appendChild(pending);
        return cell;
    }

    const counts = Array.isArray(profile.histCounts) ? profile.histCounts : [];
    if (counts.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'profile-hist-empty';
        empty.textContent = '\u2014';
        cell.appendChild(empty);
        return cell;
    }

    const maxCount = Math.max(...counts);
    if (!Number.isFinite(maxCount) || maxCount <= 0) {
        const empty = document.createElement('span');
        empty.className = 'profile-hist-empty';
        empty.textContent = '\u2014';
        cell.appendChild(empty);
        return cell;
    }

    const histogram = document.createElement('div');
    histogram.className = 'profile-hist';
    for (const count of counts) {
        const bar = document.createElement('span');
        bar.className = 'profile-hist-bar';
        bar.style.height = `${Math.max(1, Math.round((count / maxCount) * 22))}px`;
        bar.title = formatCount(count);
        histogram.appendChild(bar);
    }
    cell.appendChild(histogram);
    return cell;
}

function createSelectionCell(profile: ProfileRow, options: ProfileGridOptions): HTMLDivElement {
    const cell = createElement('div', 'profile-cell profile-cell-check');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = (options.getSelectedColumns?.() ?? []).includes(profile.name);
    checkbox.setAttribute('aria-label', `Select ${profile.name} for upload`);

    const timeColumn = options.getTimeColumn?.() ?? null;
    if (profile.name === timeColumn) {
        checkbox.disabled = true;
        checkbox.checked = true;
        checkbox.title = 'Time column is required';
    }

    checkbox.addEventListener('change', () => {
        const selected = new Set(options.getSelectedColumns?.() ?? []);
        if (checkbox.checked) selected.add(profile.name);
        else selected.delete(profile.name);
        if (timeColumn) selected.add(timeColumn);
        options.onSelectionChange?.(Array.from(selected));
    });
    cell.appendChild(checkbox);
    return cell;
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
}

/** Build the shared profile filter controls used by Upload and Preparation. */
export function createProfileFilterControls(options: ProfileFilterControlsOptions): HTMLDivElement {
    const controls = createElement('div', 'upload-preview-head');
    const typeGroup = createElement('div', 'upload-preview-type-group toolbar-group--sep');
    const showLabel = createElement('span', 'upload-preview-selection-text');
    showLabel.textContent = 'Show';
    const typeLabel = createElement('span', 'toolbar-label');
    typeLabel.textContent = 'Type';
    const categories = createElement('div', 'profile-filter-categories');
    categories.setAttribute('role', 'group');
    categories.setAttribute('aria-label', 'Profile filter category');
    const categoryOptions: Array<[ProfileFilterCategory, string]> = [
        ['all', 'All'],
        ['numeric', 'Numeric'],
        ['datetime', 'Datetime'],
    ];
    for (const [category, label] of categoryOptions) {
        const button = createElement('button', 'btn btn-select profile-filter-category-btn');
        button.type = 'button';
        button.dataset.category = category;
        button.textContent = label;
        categories.appendChild(button);
    }
    typeGroup.append(showLabel, typeLabel, categories);

    const filter = createElement('div', 'upload-preview-filter');
    const input = createElement('input', 'column-filter-input');
    input.id = options.inputId;
    input.type = 'text';
    input.value = options.filterText ?? '';
    input.placeholder = 'Filter columns…';
    input.setAttribute('aria-label', 'Filter profile columns');
    input.addEventListener('input', () => options.onFilterTextChange(input.value));
    filter.appendChild(input);

    controls.append(typeGroup, filter);
    bindProfileFilterCategoryControls({
        root: controls,
        getFilterCategory: () => options.filterCategory ?? 'all',
        onFilterCategoryChange: options.onFilterCategoryChange,
    });
    return controls;
}

function gridElements(root: HTMLElement): {
    viewport: HTMLElement;
    spacer: HTMLElement;
    rows: HTMLElement;
} | null {
    const viewport = root.querySelector<HTMLElement>('.profile-grid-viewport');
    const spacer = root.querySelector<HTMLElement>('.profile-grid-spacer');
    const rows = root.querySelector<HTMLElement>('.profile-grid-rows');
    return viewport && spacer && rows ? { viewport, spacer, rows } : null;
}

/** Create the same grid shell used by Upload when a page does not have static markup. */
export function ensureProfileGridMarkup(root: HTMLElement, options: Pick<ProfileGridOptions, 'selectable' | 'ariaLabel' | 'caption'> = {}): void {
    root.classList.add('profile-grid');
    root.setAttribute('role', 'table');
    root.setAttribute('aria-label', options.ariaLabel ?? 'Column profile table');

    if (gridElements(root)) return;

    const selectable = options.selectable !== false;
    const columns = profileColumns(selectable);
    const caption = createElement('span', 'sr-only');
    caption.textContent = options.caption ?? 'Column profile table.';
    if (root.id) {
        caption.id = `${root.id}-caption`;
        root.setAttribute('aria-describedby', caption.id);
    }

    const header = createElement('div', 'profile-grid-header');
    header.setAttribute('role', 'row');
    for (const column of columns) {
        const cell = createElement('div', `profile-col${column.key === 'selected' ? ' profile-col-check' : ''}`);
        cell.setAttribute('role', 'columnheader');
        if (column.key === 'selected') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.setAttribute('aria-label', 'Select all upload columns');
            cell.appendChild(checkbox);
        } else {
            cell.textContent = PROFILE_GRID_LABELS[column.key] ?? column.label;
        }
        header.appendChild(cell);
    }

    const viewport = createElement('div', 'profile-grid-viewport');
    viewport.setAttribute('role', 'rowgroup');
    const spacer = createElement('div', 'profile-grid-spacer');
    const rows = createElement('div', 'profile-grid-rows');
    if (root.id) {
        viewport.id = `${root.id}-viewport`;
        spacer.id = `${root.id}-spacer`;
        rows.id = `${root.id}-rows`;
    }
    spacer.appendChild(rows);
    viewport.appendChild(spacer);
    root.replaceChildren(caption, header, viewport);
}

function applyColumnsTemplate(root: HTMLElement, options: ProfileGridOptions, columns: ProfileColumnDef[]): void {
    const widths = options.getColumnWidths?.()
        ?? (options.selectable === false ? getDefaultProfileColumnWidths().slice(1) : getDefaultProfileColumnWidths());
    const template = columns.map((column, index) => {
        const width = Number(widths[index]);
        return `${Math.max(column.minWidth, Math.round(Number.isFinite(width) && width > 0 ? width : column.defaultWidth))}px`;
    }).join(' ');
    root.style.setProperty('--profile-grid-cols', template);
}

function updateHeaderState(root: HTMLElement, options: ProfileGridOptions): void {
    const header = root.querySelector<HTMLElement>('.profile-grid-header');
    if (!header || !options.getSort) return;
    const sort = options.getSort();
    for (const cell of Array.from(header.children) as HTMLElement[]) {
        const sortable = cell.dataset.sortable === '1';
        const key = cell.dataset.sortKey;
        cell.classList.toggle('sortable', sortable);
        cell.classList.remove('sorted-asc', 'sorted-desc');
        cell.removeAttribute('aria-sort');
        if (!sortable || !key) continue;
        if (key === sort.key) {
            const descending = sort.dir === 'desc';
            cell.classList.add(descending ? 'sorted-desc' : 'sorted-asc');
            cell.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
        } else {
            cell.setAttribute('aria-sort', 'none');
        }
    }
}

function bindHeader(
    options: ProfileGridOptions,
    columns: ProfileColumnDef[],
    render: (resetScroll?: boolean) => void,
    signal: AbortSignal,
): void {
    const header = options.root.querySelector<HTMLElement>('.profile-grid-header');
    if (!header) return;

    const cells = Array.from(header.children) as HTMLElement[];
    cells.forEach((cell, index) => {
        const column = columns[index];
        if (!column) return;
        cell.dataset.sortKey = column.key;
        cell.dataset.sortable = column.sortable ? '1' : '0';

        if (column.sortable && options.getSort && options.setSort) {
            cell.tabIndex = 0;
            cell.addEventListener('click', () => {
                const current = options.getSort!();
                options.setSort!({
                    key: column.key,
                    dir: current.key === column.key && current.dir === 'asc' ? 'desc' : 'asc',
                });
                updateHeaderState(options.root, options);
                render(true);
            }, { signal });
            cell.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                cell.click();
            }, { signal });
        }

        if (index >= cells.length - 1 || !options.getColumnWidths || !options.setColumnWidths) return;
        const resizer = createElement('span', 'profile-col-resizer');
        resizer.setAttribute('role', 'separator');
        resizer.setAttribute('aria-orientation', 'vertical');
        resizer.addEventListener('pointerdown', (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const widths = options.getColumnWidths!();
            const startWidth = Number(widths[index]) || column.defaultWidth;
            const onMove = (moveEvent: PointerEvent) => {
                const next = Math.max(column.minWidth, startWidth + moveEvent.clientX - startX);
                const nextWidths = [...options.getColumnWidths!()];
                nextWidths[index] = next;
                options.setColumnWidths!(nextWidths);
                applyColumnsTemplate(options.root, options, columns);
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove, { signal });
            window.addEventListener('pointerup', onUp, { signal });
        }, { signal });
        cell.appendChild(resizer);
        signal.addEventListener('abort', () => resizer.remove(), { once: true });
    });

    updateHeaderState(options.root, options);
}

function renderInternal(
    options: ProfileGridOptions,
    resetScroll: boolean,
    getVisibleProfiles: () => ProfileRow[],
): void {
    ensureProfileGridMarkup(options.root, options);
    const elements = gridElements(options.root);
    if (!elements) return;
    const columns = profileColumns(options.selectable !== false);
    applyColumnsTemplate(options.root, options, columns);
    if (resetScroll) elements.viewport.scrollTop = 0;

    const profiles = getVisibleProfiles();
    const viewportHeight = Math.max(1, elements.viewport.clientHeight || 1);
    elements.spacer.style.height = `${Math.max(profiles.length * PROFILE_ROW_HEIGHT, viewportHeight)}px`;

    if (profiles.length === 0) {
        elements.rows.style.transform = 'translateY(0px)';
        elements.rows.replaceChildren();
        const row = createElement('div', 'profile-grid-row');
        row.setAttribute('role', 'row');
        const nameIndex = columns.findIndex((column) => column.key === 'name');
        columns.forEach((_, index) => row.appendChild(createProfileCell(
            index === nameIndex ? options.emptyMessage ?? 'No columns match this filter' : '',
            'muted',
        )));
        elements.rows.appendChild(row);
        return;
    }

    const scrollTop = Math.max(0, elements.viewport.scrollTop);
    const visibleRows = Math.ceil(viewportHeight / PROFILE_ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / PROFILE_ROW_HEIGHT) - PROFILE_OVERSCAN);
    const end = Math.min(profiles.length, start + visibleRows + PROFILE_OVERSCAN * 2);
    elements.rows.style.transform = `translateY(${start * PROFILE_ROW_HEIGHT}px)`;
    elements.rows.replaceChildren();

    for (let index = start; index < end; index++) {
        const profile = profiles[index]!;
        const pending = profile.profilePending === true;
        const totalCount = profile.nonNullCount + profile.nullCount;
        const nonNullPct = totalCount > 0 ? (profile.nonNullCount / totalCount) * 100 : 0;
        const row = createElement('div', 'profile-grid-row');
        row.setAttribute('role', 'row');

        if (options.selectable !== false) row.appendChild(createSelectionCell(profile, options));
        row.appendChild(createProfileCell(profile.name));
        row.appendChild(createProfileCell(normalizeDtypeLabel(profile.dtype), 'muted'));
        row.appendChild(createProfileCell(
            pending ? 'Pending' : `${formatCount(profile.nonNullCount)} (${nonNullPct.toFixed(1)}%)`,
            pending ? 'muted' : 'num',
        ));
        row.appendChild(createProfileCell(pending ? 'Pending' : formatCount(profile.nullCount), pending ? 'muted' : 'num'));

        const minCell = createProfileCell(pending ? 'Pending' : formatProfileValue(profile.min, profile.dtype), pending ? 'muted' : 'num');
        const minTitle = formatProfileValueTitle(profile.min, profile.dtype);
        if (minTitle) minCell.title = minTitle;
        row.appendChild(minCell);
        const maxCell = createProfileCell(pending ? 'Pending' : formatProfileValue(profile.max, profile.dtype), pending ? 'muted' : 'num');
        const maxTitle = formatProfileValueTitle(profile.max, profile.dtype);
        if (maxTitle) maxCell.title = maxTitle;
        row.appendChild(maxCell);
        row.appendChild(createHistogramCell(profile));
        elements.rows.appendChild(row);
    }
}

export function renderProfileGrid(options: ProfileGridOptions, resetScroll = false): void {
    renderInternal(options, resetScroll, () => filteredProfileRows(
        options.getProfiles(),
        options.getFilterText?.() ?? '',
        options.getFilterCategory?.() ?? 'all',
        options.getSort?.() ?? { key: null, dir: 'asc' },
    ));
}

export function createProfileGridController(options: ProfileGridOptions): ProfileGridController {
    ensureProfileGridMarkup(options.root, options);
    const lifetime = new AbortController();
    const columns = profileColumns(options.selectable !== false);
    let cachedProfiles: readonly ProfileRow[] | null = null;
    let cachedKey: string | null = null;
    let cachedView: ProfileRow[] | null = null;
    let scrollRafId: number | null = null;

    const getVisibleProfiles = (): ProfileRow[] => {
        const profiles = options.getProfiles();
        const filterText = options.getFilterText?.() ?? '';
        const filterCategory = options.getFilterCategory?.() ?? 'all';
        const sort = options.getSort?.() ?? { key: null, dir: 'asc' as const };
        const key = `${filterText.trim().toLowerCase()}|${filterCategory}|${sort.key ?? ''}|${sort.dir ?? ''}`;
        if (cachedView && cachedProfiles === profiles && cachedKey === key) return cachedView;
        cachedView = filteredProfileRows(profiles, filterText, filterCategory, sort);
        cachedProfiles = profiles;
        cachedKey = key;
        return cachedView;
    };

    const controller: ProfileGridController = {
        render(resetScroll = false) {
            renderInternal(options, resetScroll, getVisibleProfiles);
            updateHeaderState(options.root, options);
        },
        invalidate() {
            cachedProfiles = null;
            cachedKey = null;
            cachedView = null;
        },
        dispose() {
            lifetime.abort();
            if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
        },
    };

    const viewport = options.root.querySelector<HTMLElement>('.profile-grid-viewport');
    const header = options.root.querySelector<HTMLElement>('.profile-grid-header');
    if (viewport) {
        viewport.addEventListener('scroll', () => {
            if (scrollRafId !== null) return;
            scrollRafId = requestAnimationFrame(() => {
                scrollRafId = null;
                controller.render(false);
                if (header) header.style.transform = `translateX(${-viewport.scrollLeft}px)`;
            });
        }, { signal: lifetime.signal });

        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => controller.render(false));
            resizeObserver.observe(viewport);
            lifetime.signal.addEventListener('abort', () => resizeObserver.disconnect(), { once: true });
        }
    }

    bindHeader(options, columns, controller.render, lifetime.signal);
    applyColumnsTemplate(options.root, options, columns);
    return controller;
}
