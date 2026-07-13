/**
 * Provenance panel — shows the currently active analysis context.
 *
 * Displays: dataset info, active time range, numeric filters,
 * adaptive filters, color encoding, selected columns.
 * Toggleable via button in the header.
 */

import { analyticsState } from '../store/analyticsState.js';
import { chartState } from '../store/chartState.js';
import { datasetState } from '../store/datasetState.js';
import { formatAnalysisTime, formatAnalysisNumber } from '../utils/format.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import { onNavigationChange } from '../platform/navigationEvents.js';

let _panel: HTMLElement | null = null;
let _content: HTMLElement | null = null;
let _workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'> | null = null;
let _disposeProvenance: (() => void) | null = null;

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
    const intent = _workspace?.getSnapshot();

    // Dataset info
    if (datasetState.metadata) {
        const m = datasetState.metadata as any;
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
    if (Number.isFinite(chartState.currentStart) && Number.isFinite(chartState.currentEnd)) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Time Range</div>
                <div class="provenance-row"><span class="provenance-key">Start</span><span class="provenance-val">${formatAnalysisTime(chartState.currentStart!)}</span></div>
                <div class="provenance-row"><span class="provenance-key">End</span><span class="provenance-val">${formatAnalysisTime(chartState.currentEnd!)}</span></div>
            </div>
        `);
    }

    // Selected columns
    if (intent?.selection.columns.length) {
        const chips = intent.selection.columns.map((c) => `<span class="provenance-chip">${escapeText(c)}</span>`).join('');
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Selected Series (${intent.selection.columns.length})</div>
                <div class="provenance-chips">${chips}</div>
            </div>
        `);
    }

    // Color encoding
    if (intent?.selection.colorColumn) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Color Encoding</div>
                <div class="provenance-row"><span class="provenance-key">Column</span><span class="provenance-val">${escapeText(intent.selection.colorColumn)}</span></div>
            </div>
        `);
    }

    // Numeric range filters
    const rangeEntries = Object.entries(intent?.filters.columnRanges ?? {});
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
    if (intent?.filters.adaptiveLines.length) {
        const rows = intent.filters.adaptiveLines.map((f) =>
            `<div class="provenance-row"><span class="provenance-key">${escapeText(f.column)}</span><span class="provenance-val">${f.keepAbove ? 'above' : 'below'} line</span></div>`,
        ).join('');
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Adaptive Filters (${intent.filters.adaptiveLines.length})</div>
                ${rows}
            </div>
        `);
    }

    // Analytics overlays
    const overlays: string[] = [];
    if (analyticsState.rollingEnabled) overlays.push(`Rolling mean (window ${analyticsState.rollingWindow})`);
    if (analyticsState.anomalyEnabled) overlays.push(`Anomaly detection (${analyticsState.anomalyMethod}, σ=${analyticsState.anomalyThreshold})`);
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

export function __resetProvenanceForTests(): void {
    _disposeProvenance?.();
    _disposeProvenance = null;
    _panel?.remove();
    _panel = null;
    _content = null;
    _workspace = null;
}

export function initProvenance(workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe'>): () => void {
    _disposeProvenance?.();
    _workspace = workspace;
    buildPanel();

    // Toggle button in header
    const btn = document.getElementById('provenance-toggle-btn');
    if (btn) btn.addEventListener('click', toggleProvenance);

    // Ctrl+I shortcut
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            toggleProvenance();
        }
    };
    window.addEventListener('keydown', onKeyDown);

    const unsubscribeNavigation = onNavigationChange(() => refreshProvenance());
    const unsubscribeWorkspace = workspace.subscribe(() => refreshProvenance());
    const dispose = () => {
        btn?.removeEventListener('click', toggleProvenance);
        window.removeEventListener('keydown', onKeyDown);
        unsubscribeNavigation();
        unsubscribeWorkspace();
        if (_disposeProvenance === dispose) {
            _disposeProvenance = null;
            _workspace = null;
        }
    };
    _disposeProvenance = dispose;
    return dispose;
}
