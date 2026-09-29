import { sampledProfileDescription } from '../services/profile/samplingDescription.js';
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
    isNumericDtype,
    isTemporalDtype,
    normalizeDtypeLabel,
    toFiniteNumberOrNull,
} from '../utils/format.js';
import type { DatasetMetadata } from '../contracts/api/v1/dataset.js';
import type { ProfileColumnDef, ProfileGridSort, ProfileQualityFindings, ProfileQualityStatus, ProfileRow } from '../types/store.js';
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

function optionalFiniteNumber(raw: unknown, key: string): number | null {
    const value = valueAt(raw, key);
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function optionalCount(raw: unknown, key: string): number | null {
    const value = optionalFiniteNumber(raw, key);
    return value !== null && value >= 0 ? value : null;
}

function optionalBoolean(raw: unknown, key: string): boolean | null {
    const value = valueAt(raw, key);
    return typeof value === 'boolean' ? value : null;
}

function qualityFindings(
    raw: unknown,
    status: ProfileQualityStatus,
    sampleRows: number | null,
    isTimeColumn: boolean,
    timeQuality: DatasetMetadata['time_quality'] | null | undefined,
): ProfileQualityFindings {
    return {
        status, sampleRows,
        nonFiniteCount: optionalCount(raw, 'non_finite_count'),
        finiteCount: optionalCount(raw, 'finite_count'),
        zeroCount: optionalCount(raw, 'zero_count'),
        longestZeroRun: optionalCount(raw, 'longest_zero_run'),
        longestZeroRunStartMs: optionalFiniteNumber(raw, 'longest_zero_run_start_ms'),
        longestZeroRunEndMs: optionalFiniteNumber(raw, 'longest_zero_run_end_ms'),
        distinctCount: optionalCount(raw, 'distinct_count'),
        isConstant: optionalBoolean(raw, 'is_constant'),
        q25: optionalFiniteNumber(raw, 'q25'),
        q75: optionalFiniteNumber(raw, 'q75'),
        interquartileRange: optionalFiniteNumber(raw, 'interquartile_range'),
        isTimeColumn,
        timeQuality: isTimeColumn ? timeQuality ?? null : null,
    };
}

function createProfileRow(
    raw: unknown,
    status: ProfileQualityStatus,
    sampleRows: number | null,
    timeColumn: string | null,
    timeQuality: DatasetMetadata['time_quality'] | null | undefined,
): ProfileRow | null {
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
        quality: qualityFindings(raw, status, sampleRows, name === timeColumn, timeQuality),
    };
}

function createProfileStub(
    column: { name?: string | null; dtype?: string | null },
    status: ProfileQualityStatus,
    sampleRows: number | null,
    timeColumn: string | null,
    timeQuality: DatasetMetadata['time_quality'] | null | undefined,
): ProfileRow | null {
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
        quality: qualityFindings(null, status, sampleRows, name === timeColumn, timeQuality),
    };
}

/** Convert any dataset metadata response into the rows used by the shared grid. */
export function profileRowsFromMetadata(metadata: DatasetMetadata | null | undefined): ProfileRow[] {
    const incoming = Array.isArray(metadata?.column_profiles) ? metadata.column_profiles : [];
    const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const profileByName = new Map<string, ProfileRow>();

    const status = metadata?.profile_status ?? 'unavailable';
    const sampleRows = metadata?.profile_sample_rows ?? null;
    const timeColumn = metadata?.time_column ?? null;
    for (const raw of incoming) {
        const profile = createProfileRow(raw, status, sampleRows, timeColumn, metadata?.time_quality);
        if (profile) profileByName.set(profile.name, profile);
    }

    for (const column of columns) {
        const profile = createProfileStub(column, status, sampleRows, timeColumn, metadata?.time_quality);
        if (!profile || profileByName.has(profile.name)) continue;
        profileByName.set(profile.name, profile);
    }

    const rows = Array.from(profileByName.values());
    if (metadata?.profile_status === 'sampled') for (const row of rows) {
        if (row.quality) row.quality.samplingDescription = sampledProfileDescription(metadata);
    }
    return rows;
}

function compareProfileValues(left: unknown, right: unknown, direction: 1 | -1): number {
    const leftValue = String(left || '').toLowerCase();
    const rightValue = String(right || '').toLowerCase();
    if (leftValue < rightValue) return -1 * direction;
    if (leftValue > rightValue) return 1 * direction;
    return 0;
}

function sortableProfileNumber(value: unknown): number | null {
    if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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

        const leftNumber = sortableProfileNumber(leftValue);
        const rightNumber = sortableProfileNumber(rightValue);
        if (leftNumber === null && rightNumber === null) return 0;
        if (leftNumber === null) return 1;
        if (rightNumber === null) return -1;
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
        if (filterCategory === 'numeric') return isNumericDtype(profile.dtype);
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

function ensureQualityDetailsPanel(root: HTMLElement): HTMLDetailsElement {
    const id = `${root.id || 'profile-grid'}-quality-details`;
    let details = document.getElementById(id) as HTMLDetailsElement | null;
    if (!details) {
        details = createElement('details', 'profile-grid-quality-details');
        details.id = id;
        details.hidden = true;
        details.setAttribute('role', 'region');
        details.setAttribute('aria-label', 'Column quality details');
        root.after(details);
    }
    return details;
}

function qualityStatusLabel(status: ProfileQualityStatus): string {
    if (status === 'exact') return 'Exact statistics';
    if (status === 'sampled') return 'Sampled estimate';
    if (status === 'immediate') return 'Immediate schema only';
    return 'Unavailable';
}

function setQualityDetails(root: HTMLElement, profile: ProfileRow, focus = true): void {
    const details = ensureQualityDetailsPanel(root);
    const quality = profile.quality;
    const summary = createElement('summary');
    summary.textContent = `Quality details for ${profile.name} · ${qualityStatusLabel(quality?.status ?? 'unavailable')}`;
    const description = createElement('p', 'profile-grid-quality-details__status');
    if (quality?.status === 'exact') description.textContent = 'Statistics describe the full source dataset for this report.';
    else if (quality?.status === 'sampled') description.textContent = quality.samplingDescription ?? `Statistics are estimates from ${quality.sampleRows?.toLocaleString() ?? 'an unspecified number of'} sampled rows; sampling method unavailable.`;
    else if (quality?.status === 'immediate') description.textContent = 'Completed column statistics are unavailable until a sampled or exact report is built.';
    else description.textContent = 'No profile statistics are available for this column.';
    if (profile.profilePending) description.textContent += ' This column has not been profiled in the current report.';

    const list = createElement('dl', 'profile-grid-quality-details__list');
    const addItem = (label: string, value: string | number | boolean | null | undefined) => {
        const term = createElement('dt'); term.textContent = label;
        const detail = createElement('dd'); detail.textContent = value == null ? 'Unavailable' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'number' ? value.toLocaleString() : value;
        list.append(term, detail);
    };
    const facts = quality;
    addItem('Non-finite values', facts?.nonFiniteCount);
    addItem('Finite values', facts?.finiteCount);
    addItem('Zero values', facts?.zeroCount);
    addItem('Distinct values', facts?.distinctCount);
    addItem('Constant column', facts?.isConstant);
    addItem('25th percentile', facts?.q25 == null ? null : formatProfileValue(facts.q25, profile.dtype));
    addItem('75th percentile', facts?.q75 == null ? null : formatProfileValue(facts.q75, profile.dtype));
    addItem('Interquartile range', facts?.interquartileRange == null ? null : formatProfileValue(facts.interquartileRange, profile.dtype));
    addItem('Longest zero run', facts?.longestZeroRun);
    if (facts?.longestZeroRunStartMs != null) addItem('Zero run start (UTC ms)', facts.longestZeroRunStartMs);
    if (facts?.longestZeroRunEndMs != null) addItem('Zero run end (UTC ms)', facts.longestZeroRunEndMs);
    if (facts?.isTimeColumn) {
        const time = facts.timeQuality;
        addItem('Unique timestamps', time?.unique_timestamp_count);
        addItem('Duplicate timestamps', time?.duplicate_timestamp_count);
        addItem('Monotonic timestamp order', time?.is_monotonic_non_decreasing);
        addItem('Out-of-order timestamps', time?.out_of_order_count);
        addItem('Minimum timestamp gap (ms)', time?.min_gap_ms);
        addItem('Median timestamp gap (ms)', time?.median_gap_ms);
        addItem('Maximum timestamp gap (ms)', time?.max_gap_ms);
    }
    details.dataset.columnName = profile.name;
    details.replaceChildren(summary, description, list);
    details.hidden = false;
    if (focus) {
        details.open = true;
        summary.focus();
    }
}

function createQualityBadge(label: string, accessibleLabel: string, warning = false): HTMLSpanElement {
    const badge = createElement('span', `profile-quality-badge${warning ? ' profile-quality-badge--warning' : ''}`);
    badge.textContent = label;
    badge.setAttribute('aria-label', accessibleLabel);
    return badge;
}

function ensureProfileGridScrollCue(root: HTMLElement): HTMLElement {
    const id = (root.id || 'profile-grid') + '-scroll-cue';
    let cue = document.getElementById(id);
    if (!cue) {
        cue = createElement('span', 'profile-grid-scroll-cue');
        cue.id = id;
        cue.setAttribute('aria-hidden', 'true');
        root.after(cue);
    }
    return cue;
}

export function syncProfileGridScrollCue(root: HTMLElement, viewport: HTMLElement): void {
    const cue = ensureProfileGridScrollCue(root);
    const overflows = viewport.scrollWidth > viewport.clientWidth + 1;
    cue.hidden = !overflows;
    if (!overflows) {
        root.classList.remove('profile-grid--scroll-left', 'profile-grid--scroll-right');
        cue.textContent = '';
        return;
    }
    const canScrollLeft = viewport.scrollLeft > 1;
    const canScrollRight = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
    root.classList.toggle('profile-grid--scroll-left', canScrollLeft);
    root.classList.toggle('profile-grid--scroll-right', canScrollRight);
    cue.textContent = canScrollLeft && canScrollRight
        ? '← More columns on both sides →'
        : canScrollRight ? 'Scroll right to see more columns →' : '← Scroll left to see earlier columns';
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

    if (gridElements(root)) { ensureQualityDetailsPanel(root); return; }

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
    ensureQualityDetailsPanel(root);
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
    const qualityPanel = document.getElementById(`${options.root.id || 'profile-grid'}-quality-details`) as HTMLDetailsElement | null;
    if (qualityPanel?.dataset.columnName) {
        const profile = options.getProfiles().find((row) => row.name === qualityPanel.dataset.columnName);
        if (profile) {
            const active = document.activeElement;
            const focusedSummary = active === qualityPanel.querySelector('summary');
            setQualityDetails(options.root, profile, false);
            if (focusedSummary) qualityPanel.querySelector('summary')?.focus({ preventScroll: true });
        } else {
            qualityPanel.hidden = true;
            qualityPanel.open = false;
            delete qualityPanel.dataset.columnName;
        }
    }
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
        row.dataset.columnName = profile.name;
        row.setAttribute('role', 'row');

        if (options.selectable !== false) row.appendChild(createSelectionCell(profile, options));
        const nameCell = createProfileCell(profile.name);
        if (profile.quality?.isConstant === true) nameCell.appendChild(createQualityBadge('Constant', `${profile.name} is constant`));
        row.appendChild(nameCell);
        row.appendChild(createProfileCell(normalizeDtypeLabel(profile.dtype), 'muted'));
        const nonNullCell = createProfileCell(
            pending ? 'Pending' : `${formatCount(profile.nonNullCount)} (${nonNullPct.toFixed(1)}%)`,
            pending ? 'muted' : 'num',
        );
        const nonFiniteCount = profile.quality?.nonFiniteCount;
        if (!pending && nonFiniteCount != null && nonFiniteCount > 0) {
            nonNullCell.appendChild(createQualityBadge(`${formatCount(nonFiniteCount)} non-finite`, `${formatCount(nonFiniteCount)} non-finite values${profile.quality?.status === 'sampled' ? ', sampled estimate' : ''}`, true));
            nonNullCell.title = `${formatCount(nonFiniteCount)} non-finite values`;
        }
        row.appendChild(nonNullCell);
        row.appendChild(createProfileCell(pending ? 'Pending' : formatCount(profile.nullCount), pending ? 'muted' : 'num'));

        const minCell = createProfileCell(pending ? 'Pending' : formatProfileValue(profile.min, profile.dtype), pending ? 'muted' : 'num');
        const minTitle = formatProfileValueTitle(profile.min, profile.dtype);
        if (minTitle) minCell.title = minTitle;
        row.appendChild(minCell);
        const maxCell = createProfileCell(pending ? 'Pending' : formatProfileValue(profile.max, profile.dtype), pending ? 'muted' : 'num');
        const maxTitle = formatProfileValueTitle(profile.max, profile.dtype);
        if (maxTitle) maxCell.title = maxTitle;
        row.appendChild(maxCell);
        const distributionCell = createHistogramCell(profile);
        const detailsButton = createElement('button', 'profile-quality-details-button');
        detailsButton.type = 'button';
        detailsButton.textContent = 'Details';
        detailsButton.setAttribute('aria-label', `Show quality details for ${profile.name}`);
        detailsButton.addEventListener('click', () => setQualityDetails(options.root, profile));
        distributionCell.classList.add('profile-cell--distribution');
        detailsButton.setAttribute('aria-controls', `${options.root.id || 'profile-grid'}-quality-details`);
        distributionCell.appendChild(detailsButton);
        row.appendChild(distributionCell);
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
            const rendered = gridElements(options.root);
            if (rendered) syncProfileGridScrollCue(options.root, rendered.viewport);
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
                if (header) header.style.transform = 'translateX(' + (-viewport.scrollLeft) + 'px)';
                syncProfileGridScrollCue(options.root, viewport);
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
