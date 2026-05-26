/**
 * Provenance panel — shows the currently active analysis context.
 *
 * Displays: dataset info, active time range, numeric filters,
 * adaptive filters, color encoding, selected columns.
 * Toggleable via button in the header.
 */

import { appState, formatAnalysisTime, formatAnalysisNumber } from '../state.js';

let _panel: HTMLElement | null = null;
let _content: HTMLElement | null = null;

function escapeText(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function buildPanel(): void {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.className = 'provenance-panel';
    _panel.hidden = true;
    _panel.id = 'provenance-panel';

    const header = document.createElement('div');
    header.className = 'provenance-header';
    header.innerHTML = '<span class="provenance-title">Analysis Context</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'provenance-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close provenance panel');
    closeBtn.addEventListener('click', toggleProvenance);
    header.appendChild(closeBtn);

    _content = document.createElement('div');
    _content.className = 'provenance-content';

    _panel.appendChild(header);
    _panel.appendChild(_content);

    // Insert after sidebar in app-content
    const appContent = document.querySelector('.app-content');
    if (appContent) {
        appContent.appendChild(_panel);
    } else {
        document.body.appendChild(_panel);
    }
}

function renderContent(): void {
    if (!_content) return;

    const sections: string[] = [];

    // Dataset info
    if (appState.metadata) {
        const m = appState.metadata as any;
        const rows = m.total_rows?.toLocaleString() ?? '—';
        const cols = m.columns?.length ?? 0;
        const timeCol = m.time_column ?? '—';
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Dataset</div>
                <div class="provenance-row"><span class="provenance-key">Rows</span><span class="provenance-val">${rows}</span></div>
                <div class="provenance-row"><span class="provenance-key">Columns</span><span class="provenance-val">${cols}</span></div>
                <div class="provenance-row"><span class="provenance-key">Time column</span><span class="provenance-val">${escapeText(timeCol)}</span></div>
            </div>
        `);
    }

    // Time range
    if (Number.isFinite(appState.currentStart) && Number.isFinite(appState.currentEnd)) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Time Range</div>
                <div class="provenance-row"><span class="provenance-key">Start</span><span class="provenance-val">${formatAnalysisTime(appState.currentStart!)}</span></div>
                <div class="provenance-row"><span class="provenance-key">End</span><span class="provenance-val">${formatAnalysisTime(appState.currentEnd!)}</span></div>
            </div>
        `);
    }

    // Selected columns
    if (appState.selectedCols.length > 0) {
        const chips = appState.selectedCols.map((c) => `<span class="provenance-chip">${escapeText(c)}</span>`).join('');
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Selected Series (${appState.selectedCols.length})</div>
                <div class="provenance-chips">${chips}</div>
            </div>
        `);
    }

    // Color encoding
    if (appState.selectedColorColumn) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Color Encoding</div>
                <div class="provenance-row"><span class="provenance-key">Column</span><span class="provenance-val">${escapeText(appState.selectedColorColumn)}</span></div>
            </div>
        `);
    }

    // Numeric range filters
    const rangeEntries = Object.entries(appState.columnRanges || {});
    if (rangeEntries.length > 0) {
        const rows = rangeEntries.map(([col, r]) =>
            `<div class="provenance-row"><span class="provenance-key">${escapeText(col)}</span><span class="provenance-val">${formatAnalysisNumber(r.from)} → ${formatAnalysisNumber(r.to)}</span></div>`,
        ).join('');
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Numeric Filters (${rangeEntries.length})</div>
                ${rows}
            </div>
        `);
    }

    // Adaptive line filters
    if (appState.adaptiveLineFilters.length > 0) {
        const rows = appState.adaptiveLineFilters.map((f) =>
            `<div class="provenance-row"><span class="provenance-key">${escapeText(f.column)}</span><span class="provenance-val">${f.keepAbove ? 'above' : 'below'} line</span></div>`,
        ).join('');
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Adaptive Filters (${appState.adaptiveLineFilters.length})</div>
                ${rows}
            </div>
        `);
    }

    // Analytics overlays
    const overlays: string[] = [];
    if (appState.rollingEnabled) overlays.push(`Rolling mean (window ${appState.rollingWindow})`);
    if (appState.anomalyEnabled) overlays.push(`Anomaly detection (${appState.anomalyMethod}, σ=${appState.anomalyThreshold})`);
    if (overlays.length > 0) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Analytics Overlays</div>
                ${overlays.map((o) => `<div class="provenance-row"><span class="provenance-val">${escapeText(o)}</span></div>`).join('')}
            </div>
        `);
    }

    if (sections.length === 0) {
        _content.innerHTML = '<div class="provenance-empty">No analysis context yet. Load a dataset and start exploring.</div>';
    } else {
        _content.innerHTML = sections.join('');
    }
}

export function toggleProvenance(): void {
    buildPanel();
    _panel!.hidden = !_panel!.hidden;
    if (!_panel!.hidden) renderContent();
}

export function refreshProvenance(): void {
    if (_panel && !_panel.hidden) renderContent();
}

export function initProvenance(): void {
    buildPanel();

    // Toggle button in header
    const btn = document.getElementById('provenance-toggle-btn');
    if (btn) btn.addEventListener('click', toggleProvenance);

    // Ctrl+I shortcut
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            toggleProvenance();
        }
    });

    // Refresh on relevant state changes
    window.addEventListener('edatime:page-change', () => refreshProvenance());
    window.addEventListener('edatime:column-filters-change', () => refreshProvenance());
    window.addEventListener('edatime:adaptive-filters-change', () => refreshProvenance());
}
