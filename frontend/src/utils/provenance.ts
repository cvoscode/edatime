/**
 * Provenance panel — shows the currently active analysis context.
 *
 * Displays: dataset info, active time range, numeric filters,
 * adaptive filters, color encoding, selected columns.
 * Toggleable via button in the header.
 */

import { analyticsState } from '../store/analyticsState.js';
import { formatAnalysisTime, formatAnalysisNumber } from '../utils/format.js';
import type { WorkspaceStore } from '../workspace/workspaceStore.js';
import type { CleaningPlanStore } from '../cleaning/store.js';
import { onNavigationChange } from '../platform/navigationEvents.js';

let _panel: HTMLElement | null = null;
let _content: HTMLElement | null = null;
let _workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe' | 'setSelection' | 'setFilters' | 'setViewport'> | null = null;
let _planStore: Pick<CleaningPlanStore, 'getSnapshot' | 'subscribe' | 'isDirty'> | null = null;
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
    header.innerHTML = '<div><span class="provenance-title">Analysis context</span><span class="provenance-subtitle">Current workspace state</span></div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'provenance-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close provenance panel');
    closeBtn.addEventListener('click', closeProvenance);
    header.appendChild(closeBtn);

    _content = document.createElement('div');
    _content.className = 'provenance-content';
    _content.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-remove-series], [data-clear-context]') : null;
        if (!target || !_workspace) return;
        if (target.dataset.removeSeries) {
            const snapshot = _workspace.getSnapshot();
            const columns = snapshot.selection.columns.filter((column) => column !== target.dataset.removeSeries);
            _workspace.setSelection(columns, snapshot.selection.colorColumn);
            return;
        }
        if (target.dataset.clearContext !== undefined) {
            _workspace.setSelection([]);
            _workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
            _workspace.setViewport(null);
        }
    });

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
    if (intent?.dataset.metadata) {
        const m = intent.dataset.metadata;
        const rows = m.total_rows?.toLocaleString() ?? '—';
        const cols = m.columns?.length ?? 0;
        const timeCol = m.time_column ?? '—';
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Dataset</div>
                <div class="provenance-row"><span class="provenance-key">Source</span><span class="provenance-val">${escapeText(m.source_name ?? 'Current dataset')}</span></div>
                <div class="provenance-row"><span class="provenance-key">Revision</span><span class="provenance-val">${intent.dataset.revision}</span></div>
                <div class="provenance-row"><span class="provenance-key">Rows</span><span class="provenance-val">${rows}</span></div>
                <div class="provenance-row"><span class="provenance-key">Columns</span><span class="provenance-val">${cols}</span></div>
                <div class="provenance-row"><span class="provenance-key">Time column</span><span class="provenance-val">${escapeText(timeCol)}</span></div>
            </div>
        `);
    }

    // Time range
    const start = Number(intent?.viewport?.xMin);
    const end = Number(intent?.viewport?.xMax);
    if (Number.isFinite(start) && Number.isFinite(end) && start < end) {
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Time Range</div>
                <div class="provenance-row"><span class="provenance-key">Start</span><span class="provenance-val">${formatAnalysisTime(start)}</span></div>
                <div class="provenance-row"><span class="provenance-key">End</span><span class="provenance-val">${formatAnalysisTime(end)}</span></div>
            </div>
        `);
    }

    // Selected columns
    if (intent?.selection.columns.length) {
        const chips = intent.selection.columns.map((c) => `<button class="provenance-chip" type="button" data-remove-series="${escapeText(c)}" aria-label="Remove ${escapeText(c)} from selected series">${escapeText(c)} <span aria-hidden="true">×</span></button>`).join('');
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

    const plan = _planStore?.getSnapshot();
    if (plan) {
        const enabledStages = plan.stages.filter((stage) => stage.enabled).length;
        sections.push(`
            <div class="provenance-section">
                <div class="provenance-section-title">Preparation plan</div>
                <div class="provenance-row"><span class="provenance-key">Stages</span><span class="provenance-val">${enabledStages} enabled / ${plan.stages.length} total</span></div>
                <div class="provenance-row"><span class="provenance-key">Status</span><span class="provenance-val">${_planStore?.isDirty() ? 'Draft changes' : 'In sync'}</span></div>
            </div>
        `);
    }

    if (sections.length === 0) {
        _content.innerHTML = '<div class="provenance-empty">No analysis context yet. Load a dataset and start exploring.</div>';
    } else {
        _content.innerHTML = sections.join('');
    }

    const hasContext = Boolean(intent && (
        intent.selection.columns.length
        || intent.selection.colorColumn
        || Object.keys(intent.filters.columnRanges).length
        || intent.filters.adaptiveLines.length
        || intent.viewport
    ));
    if (hasContext) {
        _content.insertAdjacentHTML('beforeend', '<div class="provenance-footer"><button class="btn btn-ghost btn-sm" type="button" data-clear-context>Clear analysis context</button></div>');
    }
}

export function toggleProvenance(): void {
    buildPanel();
    if (_panel!.hidden) openProvenance();
    else closeProvenance();
}

function openProvenance(): void {
    buildPanel();
    _panel!.hidden = false;
    document.querySelector('.app-content')?.classList.add('provenance-open');
    document.getElementById('provenance-toggle-btn')?.setAttribute('aria-expanded', 'true');
    renderContent();
}

function closeProvenance(): void {
    if (!_panel) return;
    _panel.hidden = true;
    document.querySelector('.app-content')?.classList.remove('provenance-open');
    document.getElementById('provenance-toggle-btn')?.setAttribute('aria-expanded', 'false');
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
    _planStore = null;
    document.querySelector('.app-content')?.classList.remove('provenance-open');
}

export function initProvenance(
    workspace: Pick<WorkspaceStore, 'getSnapshot' | 'subscribe' | 'setSelection' | 'setFilters' | 'setViewport'>,
    planStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'subscribe' | 'isDirty'>,
): () => void {
    _disposeProvenance?.();
    _workspace = workspace;
    _planStore = planStore ?? null;
    buildPanel();

    // Toggle button in header
    const btn = document.getElementById('provenance-toggle-btn');
    if (btn) btn.addEventListener('click', toggleProvenance);

    // Ctrl+I shortcut
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            toggleProvenance();
        } else if (e.key === 'Escape' && _panel && !_panel.hidden) {
            closeProvenance();
            btn?.focus();
        }
    };
    window.addEventListener('keydown', onKeyDown);

    const unsubscribeNavigation = onNavigationChange(() => refreshProvenance());
    const unsubscribeWorkspace = workspace.subscribe(() => refreshProvenance());
    const unsubscribePlan = planStore?.subscribe(() => refreshProvenance()) ?? (() => {});
    const dispose = () => {
        btn?.removeEventListener('click', toggleProvenance);
        window.removeEventListener('keydown', onKeyDown);
        unsubscribeNavigation();
        unsubscribeWorkspace();
        unsubscribePlan();
        closeProvenance();
        if (_disposeProvenance === dispose) {
            _disposeProvenance = null;
            _workspace = null;
        }
    };
    _disposeProvenance = dispose;
    return dispose;
}
