/**
 * causal/causalPage — orchestration layer.
 * Delegates chart lifecycle to graphView, edit UI to editPanel,
 * column chips to chipPanel, status/progress to statusView,
 * and shared state to selectionState.
 */
import { fetchCausalGraph } from '../services/api/index.js';
import { notifyCausalGraphUpdated } from './causalComparison.js';
import { createAnalysisPageRuntime } from '../pages/shared/analysisPageRuntime.js';

export type { CausalDeps } from './selectionState.js';
export type { MetadataColumn, CausalMetadata } from './selectionState.js';

import {
    _currentColumns, _currentLinks, _currentTauMax,
    _chipColors, _nodeLabels, _nodeAttrs, _pairAttrs,
    _nodePositions, _selectedColumns, _addEdgeMode, _addEdgeFirst,
    setAddEdgeMode, setAddEdgeFirst,
    setCurrentColumns, setCurrentLinks, setCurrentTauMax,
    isNumericColumn, ensureNodeMetadata, listPairGroups,
} from './selectionState.js';

import { renderColumnChips } from './chipPanel.js';
import { initChart, scheduleCausalChartRefresh, setChartEl, renderEChartsGraph } from './graphView.js';
import { setStatus, setProgress, hideProgress, syncCausalEmptyState } from './statusView.js';
import { openEditPanel, applyEditPanel, closeEditPanel, deleteTarget, bindEditPanelEvents } from './editPanel.js';

let _chartEl: HTMLDivElement | null = null;
const METHOD_PC_STAGE = new Set(['pcmci', 'pcmciplus', 'lpcmci']);
let _activePopover: HTMLElement | null = null;

/** Module-level runtime handle for the causal page lifecycle. */
let causalRuntime: ReturnType<typeof createAnalysisPageRuntime> | null = null;
let causalPageCleanup: (() => void) | null = null;

/** Module-level wrapper to sync causal empty state from outside initCausalPage. */
let _syncCausalEmptyState: (count: number) => void = (_count: number) => {};

function initInfoIcons(): void {
    document.querySelectorAll<HTMLElement>('.causal-info-icon').forEach((icon) => {
        const tipText = (icon.getAttribute('data-causal-tip') || '').replace(/\\n/g, '\n');
        const show = (anchorX: number, anchorY: number) => {
            hidePopover();
            const pop = document.createElement('div');
            pop.className = 'causal-tip-popover';
            const pre = document.createElement('pre');
            pre.textContent = tipText;
            pop.appendChild(pre);
            pop.style.left = anchorX + 'px';
            pop.style.top = anchorY + 'px';
            document.body.appendChild(pop);
            _activePopover = pop;
            const rect = pop.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 8) pop.style.top = (anchorY - rect.height - 4) + 'px';
            if (rect.right > window.innerWidth - 8) pop.style.left = (anchorX - rect.width - 16) + 'px';
        };
        icon.addEventListener('mouseenter', (event) => show(event.clientX + 14, event.clientY + 22));
        icon.addEventListener('mousemove', (event) => {
            if (_activePopover) { _activePopover.style.left = (event.clientX + 14) + 'px'; _activePopover.style.top = (event.clientY + 22) + 'px'; }
        });
        icon.addEventListener('mouseleave', hidePopover);
        icon.addEventListener('focus', () => { const rect = icon.getBoundingClientRect(); show(rect.right + 8, rect.top); });
        icon.addEventListener('blur', hidePopover);
    });
}

function hidePopover(): void { _activePopover?.remove(); _activePopover = null; }

function controlDecorators(control: HTMLElement | null): HTMLElement[] {
    if (!control) return [];
    const out: HTMLElement[] = [control];
    const prev = control.previousElementSibling as HTMLElement | null;
    const next = control.nextElementSibling as HTMLElement | null;
    if (prev) out.push(prev);
    if (next?.classList.contains('causal-info-icon')) out.push(next);
    return out;
}

function setControlEnabled(control: HTMLInputElement | HTMLSelectElement | null, enabled: boolean, title: string): void {
    if (!control) return;
    control.disabled = !enabled;
    control.title = enabled ? '' : title;
    for (const el of controlDecorators(control)) {
        el.classList.toggle('causal-setting-disabled', !enabled);
        if (!enabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
    }
}

function applyMethodControlState(method: string): void {
    const pcAlphaInput = document.getElementById('causal-pc-alpha') as HTMLInputElement | null;
    const maxCondsInput = document.getElementById('causal-max-conds') as HTMLInputElement | null;
    const usesPcStage = METHOD_PC_STAGE.has(method);
    setControlEnabled(pcAlphaInput, usesPcStage, method.toUpperCase() + ' does not use PC alpha.');
    setControlEnabled(maxCondsInput, usesPcStage, method.toUpperCase() + ' does not use max conditioning sets.');
}

function escH(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function edgeDirectionCode(group: { direction: string; hasUndirected: boolean; hasAmbiguous: boolean }): number {
    if (group.direction === 'a_to_b') return 1;
    if (group.direction === 'b_to_a') return 2;
    if (group.hasUndirected || group.hasAmbiguous) return 3;
    return 0;
}

function aggregateExportEdges(): Array<Record<string, unknown>> {
    return listPairGroups().map((group) => ({
        key: group.key,
        node_a: group.nodeA,
        node_b: group.nodeB,
        direction_summary: group.direction,
        lags: group.lags,
        connection_count: group.connections.length,
        mean_value: group.meanValue,
        min_pvalue: Number.isFinite(group.minPValue) ? group.minPValue : null,
        attrs: _pairAttrs.get(group.key) ?? {},
        connections: group.connections,
    }));
}

function handleExport(fmt: string): void {
    if (_currentColumns.length === 0) { setStatus('Nothing to export. Compute a graph or add nodes first.'); return; }
    let content = '';
    let filename = 'causal_graph.json';
    let mime = 'application/json';
    if (fmt === 'glm') { content = exportGLM(); filename = 'causal_glm_formulas.txt'; mime = 'text/plain'; }
    else if (fmt === 'torch') { content = exportTorchGeometric(); filename = 'causal_torch_geometric.json'; }
    else { content = exportJSON(); }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
    document.body.appendChild(anchor);
    requestAnimationFrame(() => { anchor.click(); window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 250); });
    setStatus('Exported ' + filename);
}

function exportJSON(): string {
    const nodes = _currentColumns.map((col) => ({
        id: col, label: _nodeLabels.get(col) || col,
        color: _chipColors.get(col) || null,
        attrs: _nodeAttrs.get(col) ?? {},
        position: _nodePositions.get(col) ?? null,
    }));
    return JSON.stringify({
        meta: {
            tau_max: _currentTauMax, rendered_edge_mode: 'one_edge_per_node_pair',
            references: { overview: 'Runge et al. Nat Rev Earth Environ (2023)', pcmci: 'Runge et al. Science Advances (2019)', pcmciplus: 'Runge UAI (2020)', lpcmci: 'Gerhardus and Runge NeurIPS (2020)' }
        },
        nodes, edges: aggregateExportEdges(), raw_links: _currentLinks,
    }, null, 2);
}

function exportGLM(): string {
    const lines: string[] = ['# GLM-style formulas derived from raw directed causal links', '# tau_max = ' + _currentTauMax, ''];
    const directed = _currentLinks.filter((link) => link.source !== link.target)
        .filter((link) => link.type === '-->' || link.type === 'o->' || link.type === '<--' || link.type === '<-o')
        .map((link) => { const src = link.type === '<--' || link.type === '<-o' ? link.target : link.source; const tgt = link.type === '<--' || link.type === '<-o' ? link.source : link.target; return { source: src, target: tgt, lag: link.lag, type: link.type, value: link.value, pvalue: link.pvalue }; });
    const byTarget = new Map<string, typeof directed>();
    _currentColumns.forEach((col) => byTarget.set(col, []));
    directed.forEach((link) => byTarget.get(link.target)?.push(link));
    for (const [target, items] of byTarget) {
        if (items.length === 0) continue;
        const lhs = _nodeLabels.get(target) || target;
        const rhs = items.map((link) => (_nodeLabels.get(link.source) || link.source) + '_lag' + link.lag).join(' + ');
        lines.push(lhs + ' ~ ' + rhs);
    }
    const uncertain = aggregateExportEdges().filter((edge) => String(edge.direction_summary).includes('mixed') || String(edge.direction_summary).includes('undirected') || String(edge.direction_summary).includes('uncertain'));
    if (uncertain.length > 0) { lines.push(''); lines.push('# Pair edges with mixed/uncertain directionality'); uncertain.forEach((edge) => { lines.push('# ' + edge.node_a + ' - ' + edge.node_b + ': ' + edge.direction_summary + '; lags=' + (Array.isArray(edge.lags) ? edge.lags.join(',') : '')); }); }
    return lines.join('\n');
}

function exportTorchGeometric(): string {
    const nodeIndex: Record<string, number> = {};
    _currentColumns.forEach((col, idx) => { nodeIndex[col] = idx; });
    const groups = listPairGroups();
    const edgeIndexA: number[] = []; const edgeIndexB: number[] = []; const edgeAttr: number[][] = [];
    const edgeDetails = groups.map((group) => {
        edgeIndexA.push(nodeIndex[group.nodeA]); edgeIndexB.push(nodeIndex[group.nodeB]);
        edgeAttr.push([group.connections.length, group.lags.length ? Math.min(...group.lags) : 0, group.lags.length ? Math.max(...group.lags) : 0, group.meanValue, Number.isFinite(group.minPValue) ? group.minPValue : 1, edgeDirectionCode(group)]);
        return { key: group.key, nodes: [group.nodeA, group.nodeB], attrs: _pairAttrs.get(group.key) ?? {}, connections: group.connections };
    });
    const nodeFeatures = _currentColumns.map((col) => ({ index: nodeIndex[col], id: col, label: _nodeLabels.get(col) || col, attrs: _nodeAttrs.get(col) ?? {} }));
    return JSON.stringify({
        meta: {
            description: 'Aggregated pair-edge export for downstream graph modeling', edge_mode: 'one_edge_per_node_pair', tau_max: _currentTauMax,
            edge_attr_names: ['connection_count', 'min_lag', 'max_lag', 'mean_value', 'min_pvalue', 'direction_code'],
            direction_codes: { 0: 'mixed_or_unknown', 1: 'node_a_to_node_b', 2: 'node_b_to_node_a', 3: 'undirected_or_uncertain' }
        },
        node_features: nodeFeatures, edge_index: [edgeIndexA, edgeIndexB], edge_attr: edgeAttr, edge_details: edgeDetails, raw_links: _currentLinks,
    }, null, 2);
}

export function initCausalPage(deps: any): void {
    const methodSelect = document.getElementById('causal-method-select') as HTMLSelectElement | null;
    const testSelect = document.getElementById('causal-test-select') as HTMLSelectElement | null;
    const tauInput = document.getElementById('causal-tau-max') as HTMLInputElement | null;
    const alphaInput = document.getElementById('causal-alpha') as HTMLInputElement | null;
    const maxCondsInput = document.getElementById('causal-max-conds') as HTMLInputElement | null;
    const fdrSelect = document.getElementById('causal-fdr-select') as HTMLSelectElement | null;
    const computeBtn = document.getElementById('causal-compute-btn') as HTMLButtonElement | null;
    const columnsBar = document.getElementById('causal-columns-bar') as HTMLElement | null;
    const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
    const exportBtn = document.getElementById('causal-export-btn') as HTMLButtonElement | null;
    const exportMenu = document.getElementById('causal-export-menu') as HTMLElement | null;

    _chartEl = document.getElementById('causal-chart') as HTMLDivElement | null;
    setChartEl(_chartEl);
    if (!_chartEl || !columnsBar) return;

    bindEditPanelEvents();
    renderColumnChips(deps, columnsBar, openEditPanel);
    syncCausalEmptyState(_currentColumns.length);
    initInfoIcons();
    applyMethodControlState(methodSelect?.value || 'pcmci');
    scheduleCausalChartRefresh();

    window.addEventListener('edatime:causal-preselect', ((e: CustomEvent) => {
        const cols: string[] = e.detail?.columns || [];
        if (cols.length === 0) return;
        _selectedColumns.clear();
        for (const c of cols) _selectedColumns.add(c);
        renderColumnChips(deps, columnsBar, openEditPanel);
        syncCausalEmptyState(_currentColumns.length);
    }) as EventListener);

    methodSelect?.addEventListener('change', () => applyMethodControlState(methodSelect.value));

    addEdgeBtn?.addEventListener('click', () => {
        setAddEdgeMode(!_addEdgeMode);
        setAddEdgeFirst(null);
        addEdgeBtn.classList.toggle('btn-accent', !_addEdgeMode);
        addEdgeBtn.classList.toggle('btn-ghost', _addEdgeMode);
        setStatus(!_addEdgeMode ? 'Add-edge mode enabled. Click two nodes to create one pair edge with a default connection.' : 'Add-edge mode cancelled.');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && _addEdgeMode) {
            setAddEdgeMode(false);
            setAddEdgeFirst(null);
            if (addEdgeBtn) { addEdgeBtn.classList.remove('btn-accent'); addEdgeBtn.classList.add('btn-ghost'); }
            setStatus('Add-edge mode cancelled.');
        }
    });

    exportBtn?.addEventListener('click', (event) => { event.stopPropagation(); if (exportMenu) exportMenu.hidden = !exportMenu.hidden; });
    exportMenu?.addEventListener('click', (event) => {
        event.stopPropagation();
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.causal-export-item');
        if (!button) return;
        exportMenu.hidden = true;
        handleExport(button.dataset.fmt || 'json');
    });

    computeBtn?.addEventListener('click', async () => {
        const meta = deps.getMetadata();
        const allSelected = Array.from(_selectedColumns);
        const numericSelected = allSelected.filter((col) => isNumericColumn(col, meta));
        const manualOnly = allSelected.filter((col) => !isNumericColumn(col, meta));
        if (numericSelected.length < 2) { setStatus('Select at least 2 numeric columns for computation. Non-numeric selections are allowed as manual/export nodes only.'); return; }
        const method = methodSelect?.value || 'pcmci';
        const tauMax = parseInt(tauInput?.value || '3', 10);
        const alpha = parseFloat(alphaInput?.value || '0.05');
        const test = testSelect?.value || 'par_corr';
        const maxCondsDim = maxCondsInput?.value ? parseInt(maxCondsInput.value, 10) : undefined;
        const fdrMethod = fdrSelect?.value || 'none';
        const methodLabel = method.toUpperCase().replace('PCMCIPLUS', 'PCMCI+');
        const usesPcStage = METHOD_PC_STAGE.has(method);
        let ticks = 0;
        try {
            deps.setLoading('causal-compute-btn', 'causal-loading', true, 'Compute');
            setProgress(0, methodLabel + ': preparing');
            const progressId = window.setInterval(() => { ticks += 1; const pct = Math.min(90, (usesPcStage ? 12 : 18) + ticks * 2); setProgress(pct, methodLabel + ': ' + (usesPcStage && ticks < 14 ? 'parent selection' : 'conditional tests')); }, 320);
            const resp = await fetchCausalGraph(numericSelected, tauMax, alpha, method, 5000, undefined,
                parseFloat((document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value || '0.2'),
                test, usesPcStage ? maxCondsDim : undefined, fdrMethod);
            window.clearInterval(progressId);
            setProgress(100, methodLabel + ': complete');
            window.setTimeout(hideProgress, 800);
            const cols = [...resp.columns, ...manualOnly.filter((col) => !resp.columns.includes(col))];
            setCurrentColumns(cols);
            setCurrentLinks(resp.links);
            setCurrentTauMax(resp.tau_max);
            notifyCausalGraphUpdated(cols, resp.links);
            window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));
            for (const col of cols) ensureNodeMetadata(col, meta, deps);
            await initChart();
            renderEChartsGraph();
            const groups = listPairGroups();
            const manualText = manualOnly.length > 0 ? ' \u00b7 ' + manualOnly.length + ' manual/meta nodes' : '';
            setStatus('' + cols.length + ' nodes \u00b7 ' + groups.length + ' pair edges \u00b7 ' + resp.links.length + ' raw connections' + manualText);
            syncCausalEmptyState(_currentColumns.length);
        } catch (error) {
            hideProgress();
            setStatus('Error: ' + ((error as Error).message || 'failed'));
            syncCausalEmptyState(_currentColumns.length);
        } finally {
            deps.setLoading('causal-compute-btn', 'causal-loading', false, 'Compute');
        }
    });

    window.addEventListener('edatime:page-change', (event: any) => {
        if (event?.detail?.page === 'causal' && deps.getMetadata()) {
            renderColumnChips(deps, columnsBar, openEditPanel);
            scheduleCausalChartRefresh();
            syncCausalEmptyState(_currentColumns.length);
        }
    });
}

/** Wraps causal page setup with the shared analysis page runtime. */
function initCausalPageRuntime(): void {
    _syncCausalEmptyState = syncCausalEmptyState;

    causalRuntime = createAnalysisPageRuntime({
        page: 'causal',
        emptyStateRootId: 'causal-empty-state',
        statusElId: 'causal-status',
        bindExportsOnInit: false,
        init() {
            _syncCausalEmptyState(_currentColumns.length);
        },
        onEveryPageChange() {
            _syncCausalEmptyState(_currentColumns.length);
        },
    });
}

/** Bootstrap call — must happen BEFORE the first edatime:page-change 'causal'
 *  event so that the runtime's event listener is registered before any page-change
 *  handlers that call initCausalPage. */
initCausalPageRuntime();
