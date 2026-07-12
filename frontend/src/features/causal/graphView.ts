/**
 * causal/graphView — ECharts lifecycle, resize observer, and chart event binding.
 * Owns _eChart, _chartEl, _chartResizeObserver, _chartEventsBound, _chartInitPromise.
 */
import {
    _chipColors,
    _nodeLabels,
    _nodeAttrs,
    _nodePositions,
    _currentColumns,
    _currentLinks,
    _addEdgeMode,
    _addEdgeFirst,
    setAddEdgeMode,
    setAddEdgeFirst,
    captureRenderedNodePositions,
    seedNodePositions,
    listPairGroups,
    getPairGroup,
    resolveLinkDirection,
    collectSelfLoops,
    buildPairGroupFromConnections,
    pairKey,
} from './selectionState.js';
import type { PairEdgeGroup } from './selectionState.js';
import type { CausalLink } from './causalComparison.js';
import { showCtxMenu, openEditPanel, type EditTarget } from './editPanel.js';
import { setStatus } from './statusView.js';
import { getPaletteColor, getChartPalette } from '../../utils/theme.js';

export let _eChart: any = null;
export let _chartEl: HTMLDivElement | null = null;

let _chartEventsBound = false;
let _chartResizeObserver: ResizeObserver | null = null;
let _chartInitPromise: Promise<void> | null = null;

// ─── Initialization helpers ────────────────────────────────────────────────

export function isCausalChartReadyForInit(): boolean {
    if (typeof document === 'undefined') return false;
    const page = document.getElementById('page-causal') as HTMLElement | null;
    return !!(page && !page.hidden && _chartEl && _chartEl.clientWidth > 0 && _chartEl.clientHeight > 0);
}

export async function initChart(): Promise<void> {
    if (!_chartEl || !isCausalChartReadyForInit()) return;
    if (_eChart) { _eChart.resize(); return; }
    if (_chartInitPromise) { await _chartInitPromise; return; }

    _chartInitPromise = (async () => {
        const echarts = await import('echarts');
        if (!_chartEl || !isCausalChartReadyForInit()) return;
        if (!_eChart) _eChart = echarts.init(_chartEl, undefined, { renderer: 'canvas' });
        _chartResizeObserver?.disconnect();
        _chartResizeObserver = new ResizeObserver(() => {
            _eChart?.resize();
            if (_currentColumns.length > 0) renderEChartsGraph();
        });
        _chartResizeObserver.observe(_chartEl);
        attachChartEvents();
    })().finally(() => { _chartInitPromise = null; });

    await _chartInitPromise;
}

export function scheduleCausalChartRefresh(attempts = 6): void {
    // A deferred retry may outlive a test environment or an application root.
    // Never schedule another browser timer once the DOM has been torn down.
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!isCausalChartReadyForInit()) {
        if (attempts <= 0) return;
        window.setTimeout(() => scheduleCausalChartRefresh(attempts - 1), 0);
        return;
    }
    void initChart().then(() => {
        if (!isCausalChartReadyForInit()) return;
        _eChart?.resize();
        if (_currentColumns.length > 0) renderEChartsGraph();
    });
}

export function setChartEl(el: HTMLDivElement | null): void {
    _chartEl = el;
}

// ─── Event binding ──────────────────────────────────────────────────────────

export function attachChartEvents(): void {
    if (!_eChart || _chartEventsBound) return;
    _chartEventsBound = true;

    _eChart.on('dblclick', (params: any) => {
        if (params.dataType !== 'node' || _addEdgeMode) return;
        const col = String(params.data?.id || '');
        if (!col) return;
        const currentLabel = _nodeLabels.get(col) || col;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentLabel;
        input.className = 'causal-node-edit';
        input.style.position = 'fixed';
        input.style.left = `${params.event.event.clientX - 60}px`;
        input.style.top = `${params.event.event.clientY - 14}px`;
        input.style.width = '120px';
        input.style.zIndex = '999';
        document.body.appendChild(input);
        input.focus();
        input.select();
        const commit = () => {
            const next = input.value.trim();
            if (next) _nodeLabels.set(col, next);
            input.remove();
            renderEChartsGraph();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
            if (event.key === 'Escape') { input.value = currentLabel; input.blur(); }
        });
    });

    _eChart.on('contextmenu', (params: any) => {
        params.event.event.preventDefault();
        const x = params.event.event.clientX;
        const y = params.event.event.clientY;
        if (params.dataType === 'node') { showCtxMenu(x, y, { kind: 'node', col: String(params.data.id) }); return; }
        if (params.dataType === 'edge' && typeof params.data?._key === 'string') { showCtxMenu(x, y, { kind: 'edge', key: String(params.data._key) }); }
    });

    _eChart.on('click', (params: any) => {
        if (!_addEdgeMode || params.dataType !== 'node') return;
        const col = String(params.data?.id || '');
        if (!col) return;
        if (!_addEdgeFirst) {
            setAddEdgeFirst(col);
            setStatus(`Selected ${col}. Click another node to add an edge.`);
            return;
        }
        if (_addEdgeFirst === col) {
            setStatus('Choose a different second node to add an edge.', 'error');
            return;
        }
        _currentLinks.push({ source: _addEdgeFirst, target: col, lag: 1, type: '-->', value: 0, pvalue: 0 });
        setAddEdgeMode(false);
        setAddEdgeFirst(null);
        const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
        if (addEdgeBtn) { addEdgeBtn.classList.remove('btn-accent'); addEdgeBtn.classList.add('btn-ghost'); }
        renderEChartsGraph();
        setStatus('Pair connection added. Right-click the edge to edit its lag, type, and metadata.', 'success');
    });

    _eChart.on('mouseup', (params: any) => {
        if (params.dataType === 'node' && params.data?.id) {
            const x = Number(params.data.x);
            const y = Number(params.data.y);
            if (Number.isFinite(x) && Number.isFinite(y)) { _nodePositions.set(String(params.data.id), { x, y }); }
            captureRenderedNodePositions(_eChart);
        }
    });
}

// ─── Graph rendering ───────────────────────────────────────────────────────

function escH(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function edgeDirectionGlyph(group: PairEdgeGroup): string {
    if (group.hasUndirected) return '↔';
    if (group.hasAmbiguous) return '?';
    if (group.direction === 'a_to_b') return '→';
    if (group.direction === 'b_to_a') return '←';
    return '↔';
}

function compactLagSummary(group: PairEdgeGroup): string {
    if (group.lags.length === 0) return 'none';
    if (group.lags.length <= 4) return group.lags.join(', ');
    return `${group.lags[0]}-${group.lags[group.lags.length - 1]}`;
}

function edgeSymbols(group: PairEdgeGroup): [string, string] {
    if (group.hasUndirected || group.hasAmbiguous || group.direction === 'mixed') return ['none', 'none'];
    if (group.direction === 'a_to_b') return ['none', 'arrow'];
    if (group.direction === 'b_to_a') return ['arrow', 'none'];
    return ['none', 'none'];
}

function edgeMetricTip(kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue'): string {
    switch (kind) {
        case 'summary': return 'Overall direction summary for this pair edge after grouping all lag-specific links together.';
        case 'tau': return 'Lag values included in this pair edge. tau=1 means one time step of delay, tau=2 means two steps, and so on.';
        case 'raw': return 'Number of raw lag-specific links collapsed into this one visual pair edge.';
        case 'pmin': return 'Smallest p-value observed among the raw links in this pair edge.';
        case 'type': return 'Raw Tigramite edge mark for this single lag-specific connection.';
        case 'value': return 'Effect strength/statistic for this raw connection. Positive and negative values indicate opposite directions of effect sign.';
        case 'pvalue': return 'P-value for this raw connection. Lower values indicate stronger evidence against the null.';
        default: return '';
    }
}

function edgeSummaryType(group: PairEdgeGroup): string {
    if (group.hasUndirected) return 'undirected/latent';
    if (group.hasAmbiguous) return 'uncertain';
    if (group.direction === 'a_to_b') return `${group.nodeA} -> ${group.nodeB}`;
    if (group.direction === 'b_to_a') return `${group.nodeB} -> ${group.nodeA}`;
    return 'mixed directions';
}

function edgeLabelText(group: PairEdgeGroup, compact: boolean): string {
    const firstLine = compact ? `${group.connections.length} links` : edgeSummaryType(group);
    const secondLine = compact
        ? `${edgeDirectionGlyph(group)} τ${compactLagSummary(group)}`
        : `τ${compactLagSummary(group)} · ${group.connections.length} links`;
    return `${firstLine}\n${secondLine}`;
}

function buildLegendGraphic(): any[] {
    const palette = getChartPalette();
    const items = [
        { color: palette.cyan, dash: false, label: 'Mostly positive effect' },
        { color: palette.danger, dash: false, label: 'Mostly negative effect' },
        { color: palette.borderHi, dash: false, label: 'Mixed directions' },
        { color: palette.warning, dash: true, label: 'Undirected / uncertain' },
    ];
    return items.map((item, idx) => ({
        type: 'group',
        bottom: 14 + (items.length - 1 - idx) * 16,
        left: 14,
        children: [
            { type: 'line', shape: { x1: 0, y1: 0, x2: 22, y2: 0 }, style: { stroke: item.color, lineWidth: 2, lineDash: item.dash ? [5, 3] : undefined } },
            { type: 'text', left: 28, top: -6, style: { text: item.label, fill: palette.textDim, fontSize: 10 } },
        ],
    }));
}

function buildPairEdge(group: PairEdgeGroup): any {
    const palette = getChartPalette();
    const absVal = Math.min(1, Math.abs(group.meanValue || 0));
    const baseColor = group.meanValue >= 0 ? palette.cyan : palette.danger;
    let color = baseColor;
    let lineType: 'solid' | 'dashed' = 'solid';
    if (group.direction === 'mixed') color = palette.borderHi;
    if (group.hasUndirected || group.hasAmbiguous) { color = palette.warning; lineType = 'dashed'; }
    const countWeight = Math.sqrt(Math.max(group.connections.length, 1));
    const width = Math.max(2, 1.25 + countWeight * 1.25 + absVal * 1.1);
    const compactLabels = listPairGroups().length > 8;
    const symbols = edgeSymbols(group);
    const arrowSize = Math.max(12, Math.min(18, width * 3.1));
    const symbolSize = symbols.includes('arrow') ? [arrowSize, arrowSize] : [0, 0];
    return {
        source: group.nodeA,
        target: group.nodeB,
        _key: group.key,
        _nodeA: group.nodeA,
        _nodeB: group.nodeB,
        _lags: group.lags,
        _count: group.connections.length,
        _direction: group.direction,
        _typeSummary: edgeSummaryType(group),
        _labelText: edgeLabelText(group, compactLabels),
        _connections: group.connections,
        lineStyle: { color, width, type: lineType, opacity: 0.86, curveness: group.direction === 'mixed' ? 0.1 : 0.14 },
        edgeSymbol: symbols,
        edgeSymbolSize: symbolSize,
        emphasis: { lineStyle: { width: width + 1.2, opacity: 1 } },
    };
}

function nodeTooltip(col: string, selfLoops: Map<string, number>): string {
    const label = _nodeLabels.get(col) || col;
    const attrs = _nodeAttrs.get(col) ?? {};
    const attrKeys = Object.keys(attrs);
    const incoming = _currentLinks.filter((link) => link.target === col && link.source !== col).length;
    const outgoing = _currentLinks.filter((link) => link.source === col && link.target !== col).length;
    const self = selfLoops.get(col) || 0;
    const dtype = typeof attrs.dtype === 'string' ? attrs.dtype : 'unknown';
    const palette = getChartPalette();
    return `<b>${escH(label)}</b><br/>` +
        `Column: ${escH(col)}<br/>` +
        `dtype: ${escH(dtype)}<br/>` +
        `Incoming raw links: ${incoming} · Outgoing raw links: ${outgoing}` +
        (self ? ` · Self-links: ${self}` : '') +
        `<br/>Attributes: ${attrKeys.length}` +
        `<br/><span style="font-size:10px;color:${palette.textDim};">Drag moves only this node. Double-click rename. Right-click edit/delete.</span>`;
}

function edgeTooltip(group: PairEdgeGroup): string {
    const palette = getChartPalette();
    const pill = (label: string, kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue', tone = palette.border) =>
        `<span class="causal-metric-pill" title="${escH(edgeMetricTip(kind))}" style="background:${tone};">${label}</span>`;
    const rows = group.connections.slice(0, 6).map((link) => {
        const direction = resolveLinkDirection(link);
        const valueTone = Number(link.value) >= 0 ? palette.marginalFill : palette.dangerFill;
        return `<div class="causal-edge-tip-row">
                    <div class="causal-edge-tip-row-title"><span>${escH(direction.source)}</span><span class="causal-connection-arrow">→</span><span>${escH(direction.target)}</span></div>
                    <div class="causal-edge-tip-pill-row">${pill(`τ=${link.lag}`, 'tau')} ${pill(escH(link.type), 'type')} ${pill(`val=${Number(link.value).toFixed(3)}`, 'value', valueTone)} ${pill(`p=${Number(link.pvalue).toFixed(4)}`, 'pvalue')}</div>
                </div>`;
    });
    const extra = group.connections.length > 6 ? `<div class="causal-edge-tip-extra">+ ${group.connections.length - 6} more raw connections in the edit panel.</div>` : '';
    return `<div class="causal-edge-tip">
            <div class="causal-edge-tip-kicker">Pair edge</div>
            <div class="causal-edge-tip-title">${escH(group.nodeA)} <span class="causal-edit-arrow">${escH(edgeDirectionGlyph(group))}</span> ${escH(group.nodeB)}</div>
            <div class="causal-edge-tip-pill-row causal-edge-tip-pill-row-summary">${pill(escH(edgeSummaryType(group)), 'summary')} ${pill(`τ ${escH(compactLagSummary(group))}`, 'tau')} ${pill(`raw ${group.connections.length}`, 'raw')} ${pill(`pmin ${Number.isFinite(group.minPValue) ? group.minPValue.toFixed(4) : 'n/a'}`, 'pmin')}</div>
            ${rows.join('')}${extra}
            <div class="causal-edge-tip-foot">Right-click to edit this pair edge and its raw lag-specific links.</div>
        </div>`;
}

export function renderEChartsGraph(): void {
    if (!_eChart) return;
    captureRenderedNodePositions(_eChart);
    seedNodePositions(_chartEl);
    const selfLoops = collectSelfLoops();
    const groups = listPairGroups();

    const nodes = _currentColumns.map((col) => {
        const pos = _nodePositions.get(col) ?? { x: 80, y: 80 };
        const label = _nodeLabels.get(col) || col;
        const palette = getChartPalette();
        const borderColor = _chipColors.get(col) || palette.accent;
        return {
            id: col, name: label,
            x: pos.x, y: pos.y, fixed: true, draggable: true, symbolSize: 48,
            label: {
                show: true, position: 'inside' as const, color: palette.text,
                fontSize: 10, fontWeight: 'bold' as const,
                formatter: (params: any) => {
                    const value = String(params.data.name || '');
                    return value.length > 8 ? `${value.slice(0, 7)}…` : value;
                },
            },
            itemStyle: { color: palette.surfaceElevated, borderColor, borderWidth: 2 },
            emphasis: { itemStyle: { borderColor: palette.cyan, borderWidth: 3, shadowBlur: 14, shadowColor: palette.pendingPoint } },
        };
    });

    const chartPalette = getChartPalette();
    _eChart.setOption({
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
            trigger: 'item', enterable: true, confine: true,
            backgroundColor: chartPalette.surfaceElevated, borderColor: chartPalette.borderHi, borderWidth: 1,
            padding: [8, 12], textStyle: { color: chartPalette.text, fontSize: 12 },
            formatter: (params: any) => {
                if (params.dataType === 'node') return nodeTooltip(String(params.data.id), selfLoops);
                if (params.dataType === 'edge') { const group = getPairGroup(String(params.data._key)); if (group) return edgeTooltip(group); }
                return '';
            },
        },
        graphic: buildLegendGraphic(),
        series: [{
            type: 'graph', layout: 'none',
            data: nodes,
            links: groups.map(buildPairEdge),
            roam: true, draggable: true, symbol: 'circle',
            edgeLabel: {
                show: true, position: 'middle', distance: 14, rotate: false,
                color: chartPalette.text, fontSize: groups.length > 8 ? 9 : 10,
                lineHeight: groups.length > 8 ? 11 : 12, fontWeight: 600,
                backgroundColor: chartPalette.background, borderColor: chartPalette.borderHi,
                borderWidth: 1, borderRadius: 14, padding: [6, 10],
                shadowBlur: 16, shadowColor: 'rgba(0,0,0,0.32)',
                formatter: (params: any) => String(params.data?._labelText || ''),
            },
            emphasis: { focus: 'adjacency' },
        }],
    }, true);
}

// Re-export for causalPage callers
export { _nodeAttrs } from './selectionState.js';
