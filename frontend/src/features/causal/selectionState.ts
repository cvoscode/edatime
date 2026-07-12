/**
 * causal/selectionState — stateful helpers that do not need DOM ownership.
 *
 * Owns column metadata derivation, pair-group computation, node position
 * tracking, and the live selection state for the causal page.
 */
import type { CausalLink } from './causalComparison.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
export type { CausalLink };
export interface MetadataColumn {
    name: string;
    dtype?: string;
}

export interface CausalMetadata {
    numeric_columns: string[];
    columns?: MetadataColumn[];
}

export interface CausalDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    chipColor: (col: string, idx: number) => string;
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

export interface PairEdgeGroup {
    key: string;
    nodeA: string;
    nodeB: string;
    connections: CausalLink[];
    lags: number[];
    meanValue: number;
    minPValue: number;
    hasUndirected: boolean;
    hasAmbiguous: boolean;
    direction: 'a_to_b' | 'b_to_a' | 'mixed';
}

export interface NodePosition {
    x: number;
    y: number;
}

export interface NodeAttributes {
    dtype?: string;
    numeric?: boolean;
}

// ─── Module-level state ─────────────────────────────────────────────────────

export let _currentColumns: string[] = [];
export let _currentLinks: CausalLink[] = [];
export let _currentTauMax = 0;
export const _chipColors = new Map<string, string>();
export const _nodeLabels = new Map<string, string>();
export const _nodeAttrs = new Map<string, NodeAttributes>();
export const _nodePositions = new Map<string, NodePosition>();
export const _selectedColumns = new Set<string>();
export let _addEdgeMode = false;
export let _addEdgeFirst: string | null = null;
export function setAddEdgeMode(v: boolean): void { _addEdgeMode = v; }
export function setAddEdgeFirst(v: string | null): void { _addEdgeFirst = v; }
export type PairAttributes = Record<string, unknown>;
export const _pairAttrs = new Map<string, PairAttributes>();
export function setCurrentColumns(v: string[]): void { _currentColumns = v; }
export function setCurrentLinks(v: CausalLink[]): void { _currentLinks = v; }
export function setCurrentTauMax(v: number): void { _currentTauMax = v; }
export function clearPairAttrsKey(key: string): void { _pairAttrs.delete(key); }
export function setPairAttrsKey(key: string, attrs: PairAttributes): void { _pairAttrs.set(key, attrs); }
export function deletePairAttrsKeys(pred: (key: string) => boolean): void {
    for (const key of Array.from(_pairAttrs.keys())) {
        if (pred(key)) _pairAttrs.delete(key);
    }
}

export function resetSelectionState(): void {
    _addEdgeMode = false;
    _addEdgeFirst = null;
    _pairAttrs.clear();
    _currentColumns = [];
    _currentLinks = [];
    _currentTauMax = 0;
    _chipColors.clear();
    _nodeLabels.clear();
    _nodeAttrs.clear();
    _nodePositions.clear();
    _selectedColumns.clear();
}

// ─── Metadata helpers ───────────────────────────────────────────────────────

export function metadataColumns(meta: CausalMetadata | null): MetadataColumn[] {
    if (!meta) return [];
    if (Array.isArray(meta.columns) && meta.columns.length > 0) return meta.columns;
    return meta.numeric_columns.map((name) => ({ name, dtype: 'numeric' }));
}

/** Reads dataset metadata from the app-owned workspace boundary. */
export function workspaceMetadata(deps: CausalDeps): CausalMetadata | null {
    return deps.workspace.getSnapshot().dataset.metadata as CausalMetadata | null;
}

export function workspaceNumericColumns(deps: CausalDeps): string[] {
    return workspaceMetadata(deps)?.numeric_columns ?? [];
}

export function numericSet(meta: CausalMetadata | null): Set<string> {
    return new Set(meta?.numeric_columns ?? []);
}

export function isNumericColumn(col: string, meta: CausalMetadata | null): boolean {
    return numericSet(meta).has(col);
}

export function defaultChipColor(col: string, idx: number, numeric: boolean, deps: CausalDeps): string {
    if (numeric) return deps.chipColor(col, idx);
    let hash = 0;
    for (let i = 0; i < col.length; i += 1) hash = ((hash << 5) - hash + col.charCodeAt(i)) | 0;
    const value = Math.abs(hash);
    const red = 72 + (value & 0x3f);
    const green = 88 + ((value >> 6) & 0x3f);
    const blue = 104 + ((value >> 12) & 0x3f);
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function ensureNodeMetadata(col: string, meta: CausalMetadata | null, deps: CausalDeps): void {
    const numeric = isNumericColumn(col, meta);
    const idx = workspaceNumericColumns(deps).indexOf(col);
    if (!_chipColors.has(col)) {
        _chipColors.set(col, defaultChipColor(col, idx, numeric, deps));
    }
    if (!_nodeLabels.has(col)) _nodeLabels.set(col, col);
    if (!_nodeAttrs.has(col)) {
        const columnMeta = metadataColumns(meta).find((item) => item.name === col);
        _nodeAttrs.set(col, {
            dtype: columnMeta?.dtype ?? (numeric ? 'numeric' : 'unknown'),
            numeric,
        });
    }
}

// ─── Pair-group computation ─────────────────────────────────────────────────

export function pairOrder(a: string, b: string): [string, string] {
    const ia = _currentColumns.indexOf(a);
    const ib = _currentColumns.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia <= ib ? [a, b] : [b, a];
    return a <= b ? [a, b] : [b, a];
}

export function pairKey(a: string, b: string): string {
    const [nodeA, nodeB] = pairOrder(a, b);
    return `${nodeA}||${nodeB}`;
}

export function resolveLinkDirection(link: CausalLink): { source: string; target: string } {
    if (link.type === '<--' || link.type === '<-o') {
        return { source: link.target, target: link.source };
    }
    return { source: link.source, target: link.target };
}

export function listPairGroups(): PairEdgeGroup[] {
    const groups = new Map<string, PairEdgeGroup>();
    for (const link of _currentLinks) {
        if (link.source === link.target) continue;
        const [nodeA, nodeB] = pairOrder(link.source, link.target);
        const key = `${nodeA}||${nodeB}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                nodeA,
                nodeB,
                connections: [],
                lags: [],
                meanValue: 0,
                minPValue: Number.POSITIVE_INFINITY,
                hasUndirected: false,
                hasAmbiguous: false,
                direction: 'mixed',
            };
            groups.set(key, group);
        }
        group.connections.push({ ...link });
    }

    return Array.from(groups.values()).map((group) => {
        group.connections.sort((left, right) => {
            if (left.lag !== right.lag) return left.lag - right.lag;
            if (left.source !== right.source) return left.source.localeCompare(right.source);
            return left.target.localeCompare(right.target);
        });
        group.lags = Array.from(new Set(group.connections.map((link) => link.lag))).sort((a, b) => a - b);
        group.meanValue = group.connections.reduce((sum, link) => sum + Number(link.value || 0), 0) / group.connections.length;
        group.minPValue = group.connections.reduce((min, link) => Math.min(min, Number(link.pvalue || 0)), Number.POSITIVE_INFINITY);
        group.hasUndirected = group.connections.some((link) => link.type === 'o-o' || link.type === 'x-x');
        group.hasAmbiguous = group.connections.some((link) => link.type === '-?>');

        let forward = 0;
        let backward = 0;
        for (const link of group.connections) {
            const resolved = resolveLinkDirection(link);
            if (resolved.source === group.nodeA && resolved.target === group.nodeB) forward += 1;
            else if (resolved.source === group.nodeB && resolved.target === group.nodeA) backward += 1;
            else { forward += 1; backward += 1; }
        }

        if (forward > 0 && backward === 0) group.direction = 'a_to_b';
        else if (backward > 0 && forward === 0) group.direction = 'b_to_a';
        else group.direction = 'mixed';
        return group;
    });
}

export function buildPairGroupFromConnections(key: string, nodeA: string, nodeB: string, connections: CausalLink[]): PairEdgeGroup {
    const group: PairEdgeGroup = {
        key,
        nodeA,
        nodeB,
        connections: connections.map((link) => ({ ...link })),
        lags: [],
        meanValue: 0,
        minPValue: Number.POSITIVE_INFINITY,
        hasUndirected: false,
        hasAmbiguous: false,
        direction: 'mixed',
    };
    group.connections.sort((left, right) => {
        if (left.lag !== right.lag) return left.lag - right.lag;
        if (left.source !== right.source) return left.source.localeCompare(right.source);
        return left.target.localeCompare(right.target);
    });
    group.lags = Array.from(new Set(group.connections.map((link) => link.lag))).sort((a, b) => a - b);
    group.meanValue = group.connections.length > 0
        ? group.connections.reduce((sum, link) => sum + Number(link.value || 0), 0) / group.connections.length
        : 0;
    group.minPValue = group.connections.reduce((min, link) => Math.min(min, Number(link.pvalue || 0)), Number.POSITIVE_INFINITY);
    group.hasUndirected = group.connections.some((link) => link.type === 'o-o' || link.type === 'x-x');
    group.hasAmbiguous = group.connections.some((link) => link.type === '-?>');
    let forward = 0;
    let backward = 0;
    for (const link of group.connections) {
        const resolved = resolveLinkDirection(link);
        if (resolved.source === group.nodeA && resolved.target === group.nodeB) forward += 1;
        else if (resolved.source === group.nodeB && resolved.target === group.nodeA) backward += 1;
        else { forward += 1; backward += 1; }
    }
    if (forward > 0 && backward === 0) group.direction = 'a_to_b';
    else if (backward > 0 && forward === 0) group.direction = 'b_to_a';
    else group.direction = 'mixed';
    return group;
}

export function getPairGroup(key: string): PairEdgeGroup | null {
    return listPairGroups().find((group) => group.key === key) ?? null;
}

export function collectSelfLoops(): Map<string, number> {
    const loops = new Map<string, number>();
    for (const link of _currentLinks) {
        if (link.source === link.target) {
            loops.set(link.source, (loops.get(link.source) ?? 0) + 1);
        }
    }
    return loops;
}

// ─── Node position tracking ─────────────────────────────────────────────────

export function captureRenderedNodePositions(eChart: any): void {
    if (!eChart) return;
    const option = eChart.getOption?.();
    const data = option?.series?.[0]?.data;
    if (!Array.isArray(data)) return;
    for (const item of data) {
        if (!item || typeof item.id !== 'string') continue;
        if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
            _nodePositions.set(item.id, { x: Number(item.x), y: Number(item.y) });
        }
    }
}

export function cleanupPositions(): void {
    const live = new Set(_currentColumns);
    for (const key of _nodePositions.keys()) {
        if (!live.has(key)) _nodePositions.delete(key);
    }
}

export function seedNodePositions(chartEl: HTMLDivElement | null): void {
    cleanupPositions();
    if (!chartEl) return;

    const width = Math.max(chartEl.clientWidth || 0, 360);
    const height = Math.max(chartEl.clientHeight || 0, 280);
    const centerX = width / 2;
    const centerY = height / 2;
    const missing = _currentColumns.filter((col) => !_nodePositions.has(col));
    if (missing.length === 0) return;

    const radius = Math.max(90, Math.min(width, height) * 0.34);
    missing.forEach((col, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(missing.length, 1) - Math.PI / 2;
        _nodePositions.set(col, {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
        });
    });
}
