/**
 * Column profile grid (virtualised table on the Upload page).
 *
 * Faithfully mirrors the original JS implementation:
 *  - reads from metadata.column_profiles (not metadata.columns)
 *  - uses the existing HTML grid structure (profile-grid-viewport / spacer / rows)
 *  - builds rows via DOM createElement, not innerHTML
 *  - uses appState.profileGridSort { key, dir } for sort state
 */

import {
    appState, PROFILE_ROW_HEIGHT, PROFILE_OVERSCAN, PROFILE_COLUMNS,
    getDefaultProfileColumnWidths, formatCount, formatProfileValue,
    normalizeDtypeLabel, toFiniteNumberOrNull,
} from '../state.js';
import type { DatasetMetadata, ProfileRow } from '../types.js';

// ─── Hydrate column profiles from metadata ──────────────────────────────────

export function hydrateColumnProfiles(metadata: DatasetMetadata): void {
    const incoming = Array.isArray((metadata as any)?.column_profiles) ? (metadata as any).column_profiles : [];
    const cols = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const profileByName = new Map<string, ProfileRow>();

    for (const raw of incoming) {
        const name = String(raw?.name || '').trim();
        if (!name) continue;

        const counts: number[] = Array.isArray(raw?.histogram?.counts)
            ? raw.histogram.counts.map((c: unknown) => Math.max(0, Number(c) || 0))
            : [];

        profileByName.set(name, {
            name,
            dtype: String(raw?.dtype || ''),
            nonNullCount: Math.max(0, Number(raw?.non_null_count) || 0),
            nullCount: Math.max(0, Number(raw?.null_count) || 0),
            min: toFiniteNumberOrNull(raw?.min),
            max: toFiniteNumberOrNull(raw?.max),
            histCounts: counts,
        });
    }

    for (const col of cols) {
        const name = String(col?.name || '').trim();
        if (!name || profileByName.has(name)) continue;
        profileByName.set(name, {
            name,
            dtype: String(col?.dtype || ''),
            nonNullCount: 0,
            nullCount: 0,
            min: null,
            max: null,
            histCounts: [],
        });
    }

    appState.columnProfiles = Array.from(profileByName.values());
}

// ─── Filtering + sorting ────────────────────────────────────────────────────

function getFilteredColumnProfiles(): ProfileRow[] {
    const profiles: ProfileRow[] = appState.columnProfiles || [];
    const q = (appState.profileFilterText || '').trim().toLowerCase();
    const filtered = !q
        ? [...profiles]
        : profiles.filter((p) => p.name.toLowerCase().includes(q) || p.dtype.toLowerCase().includes(q));

    const { key, dir } = appState.profileGridSort || {};
    const sortDir = dir === 'desc' ? -1 : 1;
    const sortable = new Set(PROFILE_COLUMNS.filter((c) => c.sortable).map((c) => c.key));
    if (!key || !sortable.has(key)) return filtered;

    filtered.sort((a, b) => {
        let av: unknown = a[key];
        let bv: unknown = b[key];

        if (key === 'name' || key === 'dtype') {
            const as = String(av || '').toLowerCase();
            const bs = String(bv || '').toLowerCase();
            if (as < bs) return -1 * sortDir;
            if (as > bs) return 1 * sortDir;
            return 0;
        }

        const an = Number(av);
        const bn = Number(bv);
        const aFinite = Number.isFinite(an);
        const bFinite = Number.isFinite(bn);
        if (!aFinite && !bFinite) return 0;
        if (!aFinite) return 1;
        if (!bFinite) return -1;
        return (an - bn) * sortDir;
    });

    return filtered;
}

// ─── Grid rendering helpers ─────────────────────────────────────────────────

function applyProfileGridColumnsTemplate(): void {
    const grid = document.getElementById('profile-grid');
    if (!grid) return;
    const widths = appState.profileGridColWidths || getDefaultProfileColumnWidths();
    const template = widths
        .map((w: number, idx: number) => `${Math.max(PROFILE_COLUMNS[idx]?.minWidth ?? 40, Math.round((Number(w) || PROFILE_COLUMNS[idx]?.defaultWidth) ?? 100))}px`)
        .join(' ');
    grid.style.setProperty('--profile-grid-cols', template);
}

function getSelectablePreviewColumns(profiles: ProfileRow[] = appState.columnProfiles || []): string[] {
    return profiles
        .map((profile) => profile.name)
        .filter((name) => name && name !== appState.previewTimeColumn);
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

function syncUploadSelectionUI(profiles: ProfileRow[] = appState.columnProfiles || []): void {
    const statusEl = document.getElementById('profile-selection-status');
    const allCheckbox = document.getElementById('profile-select-all-checkbox') as HTMLInputElement | null;
    const selectable = getSelectablePreviewColumns(profiles);
    const selected = new Set(appState.previewSelectedColumns || []);
    const selectedCount = selectable.filter((name) => selected.has(name)).length;

    if (statusEl) {
        statusEl.textContent = formatUploadSelectionStatus(
            selectable.length,
            selectedCount,
            appState.previewTimeColumn,
        );
    }

    if (allCheckbox) {
        allCheckbox.checked = selectable.length > 0 && selectedCount === selectable.length;
        allCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
    }
}

function updateProfileGridHeaderState(): void {
    const header = document.querySelector('.profile-grid-header');
    if (!header) return;

    const sortKey = appState.profileGridSort?.key;
    const sortDir = appState.profileGridSort?.dir;
    const cells = Array.from(header.children) as HTMLElement[];
    for (const cell of cells) {
        const key = cell.dataset.sortKey;
        const sortable = cell.dataset.sortable === '1';
        cell.classList.toggle('sortable', sortable);
        cell.classList.remove('sorted-asc', 'sorted-desc');
        cell.removeAttribute('aria-sort');
        if (!sortable || !key) continue;

        if (key === sortKey) {
            const cls = sortDir === 'desc' ? 'sorted-desc' : 'sorted-asc';
            const aria = sortDir === 'desc' ? 'descending' : 'ascending';
            cell.classList.add(cls);
            cell.setAttribute('aria-sort', aria);
        } else {
            cell.setAttribute('aria-sort', 'none');
        }
    }
}

function initProfileGridHeaderControls(): void {
    if (appState.profileGridHeaderBound) return;

    const header = document.querySelector('.profile-grid-header');
    if (!header) return;

    const cells = Array.from(header.children) as HTMLElement[];
    cells.forEach((cell, idx) => {
        const def = PROFILE_COLUMNS[idx];
        if (!def) return;

        cell.dataset.sortKey = def.key;
        cell.dataset.sortable = def.sortable ? '1' : '0';

        if (def.sortable) {
            cell.tabIndex = 0;
            cell.addEventListener('click', () => {
                const current = appState.profileGridSort || { key: def.key, dir: 'asc' as const };
                if (current.key === def.key) {
                    appState.profileGridSort = { key: def.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
                } else {
                    appState.profileGridSort = { key: def.key, dir: 'asc' };
                }
                updateProfileGridHeaderState();
                renderColumnProfilesGrid(true);
            });
            cell.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                cell.click();
            });
        }

        if (idx < cells.length - 1) {
            const resizer = document.createElement('span');
            resizer.className = 'profile-col-resizer';
            resizer.setAttribute('role', 'separator');
            resizer.setAttribute('aria-orientation', 'vertical');
            resizer.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const startX = event.clientX;
                const startW = Number(appState.profileGridColWidths[idx]) || def.defaultWidth;
                const onMove = (moveEvent: PointerEvent) => {
                    const dx = moveEvent.clientX - startX;
                    const next = Math.max(def.minWidth, startW + dx);
                    appState.profileGridColWidths[idx] = next;
                    applyProfileGridColumnsTemplate();
                };
                const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
            });
            cell.appendChild(resizer);
        }
    });

    updateProfileGridHeaderState();
    appState.profileGridHeaderBound = true;
}

// ─── Cell creators ──────────────────────────────────────────────────────────

function createProfileCell(text: string, extraClass = ''): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = `profile-cell ${extraClass}`.trim();
    cell.textContent = text;
    return cell;
}

function createSelectionCell(profile: ProfileRow): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = 'profile-cell profile-cell-check';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = (appState.previewSelectedColumns || []).includes(profile.name);
    checkbox.setAttribute('aria-label', `Select ${profile.name} for upload`);

    if (profile.name === appState.previewTimeColumn) {
        checkbox.disabled = true;
        checkbox.checked = true;
        checkbox.title = 'Time column is required';
    }

    checkbox.addEventListener('change', () => {
        const selected = new Set(appState.previewSelectedColumns || []);
        if (checkbox.checked) selected.add(profile.name);
        else selected.delete(profile.name);
        if (appState.previewTimeColumn) selected.add(appState.previewTimeColumn);
        appState.previewSelectedColumns = Array.from(selected);
        syncUploadSelectionUI();
    });

    cell.appendChild(checkbox);
    return cell;
}

function createHistogramCell(profile: ProfileRow): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = 'profile-cell';

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

    const hist = document.createElement('div');
    hist.className = 'profile-hist';
    for (const count of counts) {
        const bar = document.createElement('span');
        bar.className = 'profile-hist-bar';
        const height = Math.max(1, Math.round((count / maxCount) * 22));
        bar.style.height = `${height}px`;
        bar.title = formatCount(count);
        hist.appendChild(bar);
    }
    cell.appendChild(hist);
    return cell;
}

// ─── Grid rendering ─────────────────────────────────────────────────────────

export function renderColumnProfilesGrid(resetScroll = false): void {
    const viewport = document.getElementById('profile-grid-viewport');
    const spacer = document.getElementById('profile-grid-spacer');
    const rows = document.getElementById('profile-grid-rows');
    if (!viewport || !spacer || !rows) return;

    if (resetScroll) viewport.scrollTop = 0;

    const profiles = getFilteredColumnProfiles();
    const total = profiles.length;
    const viewportHeight = Math.max(1, viewport.clientHeight || 1);

    spacer.style.height = `${Math.max(total * PROFILE_ROW_HEIGHT, viewportHeight)}px`;

    if (total === 0) {
        rows.style.transform = 'translateY(0px)';
        rows.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'profile-grid-row';
        for (let i = 0; i < PROFILE_COLUMNS.length; i++) {
            row.appendChild(createProfileCell(i === 1 ? 'No columns match this filter' : '', 'muted'));
        }
        rows.appendChild(row);
        syncUploadSelectionUI(profiles);
        return;
    }

    const scrollTop = Math.max(0, viewport.scrollTop);
    const visibleRows = Math.ceil(viewportHeight / PROFILE_ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / PROFILE_ROW_HEIGHT) - PROFILE_OVERSCAN);
    const end = Math.min(total, start + visibleRows + PROFILE_OVERSCAN * 2);

    rows.style.transform = `translateY(${start * PROFILE_ROW_HEIGHT}px)`;
    rows.innerHTML = '';

    for (let idx = start; idx < end; idx++) {
        const profile = profiles[idx];
        const totalCount = profile.nonNullCount + profile.nullCount;
        const nonNullPct = totalCount > 0 ? (profile.nonNullCount / totalCount) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'profile-grid-row';
        row.setAttribute('role', 'row');

        row.appendChild(createSelectionCell(profile));
        row.appendChild(createProfileCell(profile.name));
        row.appendChild(createProfileCell(normalizeDtypeLabel(profile.dtype), 'muted'));
        row.appendChild(createProfileCell(`${formatCount(profile.nonNullCount)} (${nonNullPct.toFixed(1)}%)`, 'num'));
        row.appendChild(createProfileCell(formatCount(profile.nullCount), 'num'));
        row.appendChild(createProfileCell(formatProfileValue(profile.min, profile.dtype), 'num'));
        row.appendChild(createProfileCell(formatProfileValue(profile.max, profile.dtype), 'num'));
        row.appendChild(createHistogramCell(profile));

        rows.appendChild(row);
    }

    syncUploadSelectionUI(profiles);
}

// ─── Init grid container ────────────────────────────────────────────────────

export function initColumnProfilesGrid(): void {
    if (appState.profileGridBound) return;
    const viewport = document.getElementById('profile-grid-viewport');
    const header = document.querySelector('.profile-grid-header') as HTMLElement | null;
    if (!viewport) return;

    viewport.addEventListener('scroll', () => {
        renderColumnProfilesGrid(false);
        if (header) {
            header.style.transform = `translateX(${-viewport.scrollLeft}px)`;
        }
    });

    const resizeObserver = new ResizeObserver(() => renderColumnProfilesGrid(false));
    resizeObserver.observe(viewport);

    initProfileGridHeaderControls();
    applyProfileGridColumnsTemplate();

    appState.profileGridBound = true;
}
