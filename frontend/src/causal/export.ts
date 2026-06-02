/**
 * causal/export — export functions for causal graph data.
 *
 * Exported modules:
 *   exportJSON()        → full graph as JSON (nodes, edges, raw_links)
 *   exportGLM()         → GLM-style regression formulas
 *   exportTorchGeometric() → PyTorch GeometricData format
 *   handleExport(fmt)   → triggers download for the given format key
 */

import {
    _currentColumns, _currentLinks, _currentTauMax,
    _chipColors, _nodeLabels, _nodeAttrs, _pairAttrs,
    _nodePositions, listPairGroups,
} from './selectionState.js';
import { setStatus } from './statusView.js';

const METHOD_PC_STAGE = new Set(['pcmci', 'pcmciplus', 'lpcmci']);

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

export function exportJSON(): string {
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

export function exportGLM(): string {
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

export function exportTorchGeometric(): string {
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

export function handleExport(fmt: string): void {
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