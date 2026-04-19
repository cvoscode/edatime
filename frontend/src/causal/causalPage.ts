import { fetchCausalGraph } from '../dataClient.js';

export interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

interface MetadataColumn {
    name: string;
    dtype?: string;
}

interface CausalMetadata {
    numeric_columns: string[];
    columns?: MetadataColumn[];
}

export interface CausalDeps {
    getMetadata: () => CausalMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

type NodeAttributes = Record<string, unknown>;
type PairAttributes = Record<string, unknown>;
type EditTarget = { kind: 'node'; col: string } | { kind: 'edge'; key: string };

interface EdgeDraftAttribute {
    draftId: string;
    key: string;
    value: string;
}

interface EdgeDraftConnection extends CausalLink {
    draftId: string;
}

interface EdgeEditDraft {
    key: string;
    nodeA: string;
    nodeB: string;
    attrs: EdgeDraftAttribute[];
    connections: EdgeDraftConnection[];
}

interface PairEdgeGroup {
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

interface NodePosition {
    x: number;
    y: number;
}

let _eChart: any = null;
let _chartEl: HTMLDivElement | null = null;
let _chartEventsBound = false;
let _currentColumns: string[] = [];
let _currentLinks: CausalLink[] = [];
let _currentTauMax = 0;
let _nodeLabels = new Map<string, string>();
let _chipColors = new Map<string, string>();
let _nodeAttrs = new Map<string, NodeAttributes>();
let _pairAttrs = new Map<string, PairAttributes>();
let _nodePositions = new Map<string, NodePosition>();
let _selectedColumns = new Set<string>();
let _editTarget: EditTarget | null = null;
let _addEdgeMode = false;
let _addEdgeFirst: string | null = null;
let _activePopover: HTMLElement | null = null;
let _edgeEditDraft: EdgeEditDraft | null = null;
let _draftSeq = 0;

const METHOD_PC_STAGE = new Set(['pcmci', 'pcmciplus', 'lpcmci']);

function setProgress(pct: number, label?: string): void {
    const bar = document.getElementById('causal-progress-fill') as HTMLElement | null;
    const lbl = document.getElementById('causal-progress-label') as HTMLElement | null;
    const wrap = document.getElementById('causal-progress') as HTMLElement | null;
    if (wrap) wrap.hidden = false;
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (lbl && label !== undefined) lbl.textContent = label;
}

function hideProgress(): void {
    const wrap = document.getElementById('causal-progress') as HTMLElement | null;
    if (wrap) wrap.hidden = true;
}

function metadataColumns(meta: CausalMetadata | null): MetadataColumn[] {
    if (!meta) return [];
    if (Array.isArray(meta.columns) && meta.columns.length > 0) return meta.columns;
    return meta.numeric_columns.map((name) => ({ name, dtype: 'numeric' }));
}

function numericSet(meta: CausalMetadata | null): Set<string> {
    return new Set(meta?.numeric_columns ?? []);
}

function isNumericColumn(col: string, meta: CausalMetadata | null): boolean {
    return numericSet(meta).has(col);
}

function defaultChipColor(col: string, idx: number, numeric: boolean, deps: CausalDeps): string {
    if (numeric) return deps.chipColor(col, idx);
    let hash = 0;
    for (let i = 0; i < col.length; i += 1) hash = ((hash << 5) - hash + col.charCodeAt(i)) | 0;
    const value = Math.abs(hash);
    const red = 72 + (value & 0x3f);
    const green = 88 + ((value >> 6) & 0x3f);
    const blue = 104 + ((value >> 12) & 0x3f);
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function ensureNodeMetadata(col: string, meta: CausalMetadata | null, deps: CausalDeps): void {
    const numeric = isNumericColumn(col, meta);
    const idx = deps.numericColumns().indexOf(col);
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

function setStatus(text: string): void {
    const statusEl = document.getElementById('causal-status') as HTMLElement | null;
    if (statusEl) statusEl.textContent = text;
}

function nextDraftId(prefix: string): string {
    _draftSeq += 1;
    return `${prefix}-${_draftSeq}`;
}

function pairOrder(a: string, b: string): [string, string] {
    const ia = _currentColumns.indexOf(a);
    const ib = _currentColumns.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia <= ib ? [a, b] : [b, a];
    return a <= b ? [a, b] : [b, a];
}

function pairKey(a: string, b: string): string {
    const [nodeA, nodeB] = pairOrder(a, b);
    return `${nodeA}||${nodeB}`;
}

function listPairGroups(): PairEdgeGroup[] {
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
            else {
                forward += 1;
                backward += 1;
            }
        }

        if (forward > 0 && backward === 0) group.direction = 'a_to_b';
        else if (backward > 0 && forward === 0) group.direction = 'b_to_a';
        else group.direction = 'mixed';
        return group;
    });
}

function buildPairGroupFromConnections(key: string, nodeA: string, nodeB: string, connections: CausalLink[]): PairEdgeGroup {
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
        else {
            forward += 1;
            backward += 1;
        }
    }
    if (forward > 0 && backward === 0) group.direction = 'a_to_b';
    else if (backward > 0 && forward === 0) group.direction = 'b_to_a';
    else group.direction = 'mixed';
    return group;
}

function getPairGroup(key: string): PairEdgeGroup | null {
    return listPairGroups().find((group) => group.key === key) ?? null;
}

function resolveLinkDirection(link: CausalLink): { source: string; target: string } {
    if (link.type === '<--' || link.type === '<-o') {
        return { source: link.target, target: link.source };
    }
    return { source: link.source, target: link.target };
}

function collectSelfLoops(): Map<string, number> {
    const loops = new Map<string, number>();
    for (const link of _currentLinks) {
        if (link.source === link.target) {
            loops.set(link.source, (loops.get(link.source) ?? 0) + 1);
        }
    }
    return loops;
}

function formatLagSummary(group: PairEdgeGroup): string {
    if (group.lags.length === 0) return 'none';
    if (group.lags.length <= 4) return group.lags.map((lag) => `tau=${lag}`).join(', ');
    return `${group.lags.length} lag values`;
}

function edgeSummaryType(group: PairEdgeGroup): string {
    if (group.hasUndirected) return 'undirected/latent';
    if (group.hasAmbiguous) return 'uncertain';
    if (group.direction === 'a_to_b') return `${group.nodeA} -> ${group.nodeB}`;
    if (group.direction === 'b_to_a') return `${group.nodeB} -> ${group.nodeA}`;
    return 'mixed directions';
}

function edgeDirectionTitle(group: PairEdgeGroup): string {
    if (group.hasUndirected) return `${group.nodeA} ↔ ${group.nodeB}`;
    if (group.hasAmbiguous) return `? ${group.nodeA} / ${group.nodeB}`;
    if (group.direction === 'a_to_b') return `${group.nodeA} → ${group.nodeB}`;
    if (group.direction === 'b_to_a') return `${group.nodeB} → ${group.nodeA}`;
    return `${group.nodeA} ↔ ${group.nodeB}`;
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

function edgeLabelText(group: PairEdgeGroup, compact: boolean): string {
    const firstLine = compact
        ? `${group.connections.length} links`
        : edgeDirectionTitle(group);
    const secondLine = compact
        ? `${edgeDirectionGlyph(group)} τ${compactLagSummary(group)}`
        : `τ${compactLagSummary(group)} · ${group.connections.length} links`;
    return `${firstLine}\n${secondLine}`;
}

function edgeSymbols(group: PairEdgeGroup): [string, string] {
    if (group.hasUndirected || group.hasAmbiguous || group.direction === 'mixed') return ['none', 'none'];
    if (group.direction === 'a_to_b') return ['none', 'arrow'];
    if (group.direction === 'b_to_a') return ['arrow', 'none'];
    return ['none', 'none'];
}

function edgeMetricTip(kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue'): string {
    switch (kind) {
        case 'summary':
            return 'Overall direction summary for this pair edge after grouping all lag-specific links together.';
        case 'tau':
            return 'Lag values included in this pair edge. tau=1 means one time step of delay, tau=2 means two steps, and so on.';
        case 'raw':
            return 'Number of raw lag-specific links collapsed into this one visual pair edge.';
        case 'pmin':
            return 'Smallest p-value observed among the raw links in this pair edge.';
        case 'type':
            return 'Raw Tigramite edge mark for this single lag-specific connection.';
        case 'value':
            return 'Effect strength/statistic for this raw connection. Positive and negative values indicate opposite directions of effect sign.';
        case 'pvalue':
            return 'P-value for this raw connection. Lower values indicate stronger evidence against the null.';
        default:
            return '';
    }
}

function edgeDirectionCode(group: PairEdgeGroup): number {
    if (group.direction === 'a_to_b') return 1;
    if (group.direction === 'b_to_a') return 2;
    if (group.hasUndirected || group.hasAmbiguous) return 3;
    return 0;
}

function captureRenderedNodePositions(): void {
    if (!_eChart) return;
    const option = _eChart.getOption?.();
    const data = option?.series?.[0]?.data;
    if (!Array.isArray(data)) return;
    for (const item of data) {
        if (!item || typeof item.id !== 'string') continue;
        if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
            _nodePositions.set(item.id, { x: Number(item.x), y: Number(item.y) });
        }
    }
}

function cleanupPositions(): void {
    const live = new Set(_currentColumns);
    for (const key of _nodePositions.keys()) {
        if (!live.has(key)) _nodePositions.delete(key);
    }
}

function seedNodePositions(): void {
    cleanupPositions();
    if (!_chartEl) return;

    const width = Math.max(_chartEl.clientWidth || 0, 360);
    const height = Math.max(_chartEl.clientHeight || 0, 280);
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
    setControlEnabled(pcAlphaInput, usesPcStage, `${method.toUpperCase()} does not use PC alpha.`);
    setControlEnabled(maxCondsInput, usesPcStage, `${method.toUpperCase()} does not use max conditioning sets.`);
}

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
            pop.style.left = `${anchorX}px`;
            pop.style.top = `${anchorY}px`;
            document.body.appendChild(pop);
            _activePopover = pop;
            const rect = pop.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 8) pop.style.top = `${anchorY - rect.height - 4}px`;
            if (rect.right > window.innerWidth - 8) pop.style.left = `${anchorX - rect.width - 16}px`;
        };

        icon.addEventListener('mouseenter', (event) => show(event.clientX + 14, event.clientY + 22));
        icon.addEventListener('mousemove', (event) => {
            if (_activePopover) {
                _activePopover.style.left = `${event.clientX + 14}px`;
                _activePopover.style.top = `${event.clientY + 22}px`;
            }
        });
        icon.addEventListener('mouseleave', hidePopover);
        icon.addEventListener('focus', () => {
            const rect = icon.getBoundingClientRect();
            show(rect.right + 8, rect.top);
        });
        icon.addEventListener('blur', hidePopover);
    });
}

function hidePopover(): void {
    _activePopover?.remove();
    _activePopover = null;
}

function renderColumnChips(deps: CausalDeps, columnsBar: HTMLElement): void {
    const meta = deps.getMetadata();
    if (!meta) return;
    const numeric = numericSet(meta);
    const cols = metadataColumns(meta);
    columnsBar.innerHTML = '';

    const allSelected = cols.length > 0 && cols.every((item) => _selectedColumns.has(item.name));
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = `series-chip fft-trace-chip causal-column-action${allSelected ? ' active' : ''}`;
    selectAllBtn.type = 'button';
    selectAllBtn.innerHTML = `<span class="chip-label">${allSelected ? 'Clear all' : 'Select all'}</span>`;
    selectAllBtn.title = allSelected ? 'Clear the causal column selection' : 'Select all columns in the pane';
    selectAllBtn.addEventListener('click', () => {
        if (allSelected) {
            _selectedColumns.clear();
        } else {
            cols.forEach((item) => _selectedColumns.add(item.name));
        }
        renderColumnChips(deps, columnsBar);
    });
    columnsBar.appendChild(selectAllBtn);

    for (const item of cols) {
        const col = item.name;
        const numericColumn = numeric.has(col);
        ensureNodeMetadata(col, meta, deps);
        const currentColor = _chipColors.get(col) ?? '#00a8ff';
        const active = _selectedColumns.has(col);

        const chip = document.createElement('button');
        chip.className = `series-chip fft-trace-chip${active ? ' active' : ''}${numericColumn ? '' : ' causal-chip-nonnumeric'}`;
        chip.type = 'button';
        chip.dataset.col = col;
        chip.style.setProperty('--chip-accent', currentColor);
        chip.title = numericColumn
            ? `Toggle ${col} for causal discovery`
            : `Toggle ${col} as a manual graph/meta node`;
        chip.innerHTML =
            `<span class="chip-label">${escH(col)}</span>` +
            `<input type="color" class="chip-color-picker" value="${escH(currentColor)}" ` +
            `aria-label="Set ${escH(col)} color" title="Set ${escH(col)} color">`;

        chip.addEventListener('click', (event) => {
            if ((event.target as HTMLElement)?.closest?.('.chip-color-picker')) return;
            if (_selectedColumns.has(col)) _selectedColumns.delete(col);
            else _selectedColumns.add(col);
            renderColumnChips(deps, columnsBar);
        });

        const colorInput = chip.querySelector('.chip-color-picker') as HTMLInputElement | null;
        if (colorInput) {
            for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) {
                colorInput.addEventListener(ev, (event) => event.stopPropagation());
            }
            colorInput.addEventListener('input', () => {
                _chipColors.set(col, colorInput.value);
                chip.style.setProperty('--chip-accent', colorInput.value);
                if (_currentColumns.includes(col)) renderEChartsGraph();
            });
        }

        columnsBar.appendChild(chip);
    }
}

async function initChart(): Promise<void> {
    if (!_chartEl) return;
    const echarts = await import('echarts');
    if (!_eChart) _eChart = echarts.init(_chartEl, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => {
        _eChart?.resize();
        if (_currentColumns.length > 0) renderEChartsGraph();
    });
    ro.observe(_chartEl);
    attachChartEvents();
}

function attachChartEvents(): void {
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
            if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
            }
            if (event.key === 'Escape') {
                input.value = currentLabel;
                input.blur();
            }
        });
    });

    _eChart.on('contextmenu', (params: any) => {
        params.event.event.preventDefault();
        const x = params.event.event.clientX;
        const y = params.event.event.clientY;
        if (params.dataType === 'node') {
            showCtxMenu(x, y, { kind: 'node', col: String(params.data.id) });
            return;
        }
        if (params.dataType === 'edge' && typeof params.data?._key === 'string') {
            showCtxMenu(x, y, { kind: 'edge', key: String(params.data._key) });
        }
    });

    _eChart.on('click', (params: any) => {
        if (!_addEdgeMode || params.dataType !== 'node') return;
        const col = String(params.data?.id || '');
        if (!col) return;
        if (!_addEdgeFirst) {
            _addEdgeFirst = col;
            setStatus(`Add-edge mode: first node = ${col}. Click the second node.`);
            return;
        }
        if (_addEdgeFirst === col) {
            setStatus('Select a different second node. Self-loops are not rendered in the pair graph.');
            return;
        }
        _currentLinks.push({
            source: _addEdgeFirst,
            target: col,
            lag: 1,
            type: '-->',
            value: 0,
            pvalue: 0,
        });
        _addEdgeMode = false;
        _addEdgeFirst = null;
        const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
        if (addEdgeBtn) {
            addEdgeBtn.classList.remove('btn-accent');
            addEdgeBtn.classList.add('btn-ghost');
        }
        renderEChartsGraph();
        setStatus('Pair connection added. Right-click the edge to edit its connection list and attributes.');
    });

    _eChart.on('mouseup', (params: any) => {
        if (params.dataType === 'node' && params.data?.id) {
            const x = Number(params.data.x);
            const y = Number(params.data.y);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                _nodePositions.set(String(params.data.id), { x, y });
            }
            captureRenderedNodePositions();
        }
    });
}

function showCtxMenu(x: number, y: number, target: EditTarget): void {
    const ctxMenu = document.getElementById('causal-ctx-menu') as HTMLElement | null;
    if (!ctxMenu) return;
    _editTarget = target;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
    ctxMenu.hidden = false;
}

function attrsToJson(value: Record<string, unknown> | undefined): string {
    return JSON.stringify(value ?? {}, null, 2);
}

function stringifyDraftValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function parseLooseValue(raw: string): unknown {
    const text = raw.trim();
    if (!text) return '';
    if (/^(true|false|null)$/i.test(text)) {
        return JSON.parse(text.toLowerCase());
    }
    if (/^-?\d+(\.\d+)?$/.test(text)) {
        const numeric = Number(text);
        if (Number.isFinite(numeric)) return numeric;
    }
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('"') && text.endsWith('"'))) {
        try {
            return JSON.parse(text);
        } catch {
            return raw;
        }
    }
    return raw;
}

function draftGroup(): PairEdgeGroup | null {
    if (!_edgeEditDraft) return null;
    return buildPairGroupFromConnections(
        _edgeEditDraft.key,
        _edgeEditDraft.nodeA,
        _edgeEditDraft.nodeB,
        _edgeEditDraft.connections.map(({ draftId: _draftId, ...link }) => link),
    );
}

function edgeTypeOptions(): string[] {
    return ['-->', 'o->', '<--', '<-o', 'o-o', 'x-x', '-?>'];
}

function syncEdgeDraftFromDom(): void {
    if (!_edgeEditDraft) return;
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl) return;

    _edgeEditDraft.attrs = Array.from(bodyEl.querySelectorAll<HTMLElement>('[data-attr-row]')).map((row) => {
        const keyInput = row.querySelector<HTMLInputElement>('[data-role="attr-key"]');
        const valueInput = row.querySelector<HTMLInputElement>('[data-role="attr-value"]');
        return {
            draftId: row.dataset.id || nextDraftId('attr'),
            key: keyInput?.value ?? '',
            value: valueInput?.value ?? '',
        };
    });

    _edgeEditDraft.connections = Array.from(bodyEl.querySelectorAll<HTMLElement>('[data-conn-row]')).map((row) => {
        const sourceInput = row.querySelector<HTMLSelectElement>('[data-role="source"]');
        const targetInput = row.querySelector<HTMLSelectElement>('[data-role="target"]');
        const lagInput = row.querySelector<HTMLInputElement>('[data-role="lag"]');
        const typeInput = row.querySelector<HTMLSelectElement>('[data-role="type"]');
        const valueInput = row.querySelector<HTMLInputElement>('[data-role="value"]');
        const pvalueInput = row.querySelector<HTMLInputElement>('[data-role="pvalue"]');
        return {
            draftId: row.dataset.id || nextDraftId('conn'),
            source: sourceInput?.value || _edgeEditDraft!.nodeA,
            target: targetInput?.value || _edgeEditDraft!.nodeB,
            lag: Number(lagInput?.value ?? 0),
            type: typeInput?.value || '-->',
            value: Number(valueInput?.value ?? 0),
            pvalue: Number(pvalueInput?.value ?? 0),
        };
    });
}

function bindEdgeDraftControls(): void {
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl || !_edgeEditDraft) return;

    bodyEl.querySelectorAll<HTMLElement>('[data-remove-attr]').forEach((button) => {
        button.onclick = () => {
            syncEdgeDraftFromDom();
            if (!_edgeEditDraft) return;
            _edgeEditDraft.attrs = _edgeEditDraft.attrs.filter((entry) => entry.draftId !== button.dataset.removeAttr);
            renderEdgeDraftEditor();
        };
    });

    bodyEl.querySelectorAll<HTMLElement>('[data-remove-conn]').forEach((button) => {
        button.onclick = () => {
            syncEdgeDraftFromDom();
            if (!_edgeEditDraft) return;
            _edgeEditDraft.connections = _edgeEditDraft.connections.filter((entry) => entry.draftId !== button.dataset.removeConn);
            renderEdgeDraftEditor();
        };
    });

    bodyEl.querySelector<HTMLElement>('[data-add-attr]')?.addEventListener('click', () => {
        syncEdgeDraftFromDom();
        if (!_edgeEditDraft) return;
        _edgeEditDraft.attrs.push({ draftId: nextDraftId('attr'), key: '', value: '' });
        renderEdgeDraftEditor();
    });

    bodyEl.querySelector<HTMLElement>('[data-add-conn]')?.addEventListener('click', () => {
        syncEdgeDraftFromDom();
        if (!_edgeEditDraft) return;
        _edgeEditDraft.connections.push({
            draftId: nextDraftId('conn'),
            source: _edgeEditDraft.nodeA,
            target: _edgeEditDraft.nodeB,
            lag: (_edgeEditDraft.connections.at(-1)?.lag ?? 0) + 1,
            type: '-->',
            value: 0,
            pvalue: 0,
        });
        renderEdgeDraftEditor();
    });
}

function renderEdgeDraftEditor(): void {
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl || !_edgeEditDraft) return;
    const group = draftGroup();
    if (!group) return;
    const attrRows = _edgeEditDraft.attrs.length > 0
        ? _edgeEditDraft.attrs.map((entry) => `
            <div class="causal-inline-editor" data-attr-row data-id="${entry.draftId}">
                <input class="modal-input" data-role="attr-key" type="text" placeholder="Key" value="${escH(entry.key)}">
                <input class="modal-input" data-role="attr-value" type="text" placeholder="Value" value="${escH(entry.value)}">
                <button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-attr="${entry.draftId}">Remove</button>
            </div>`).join('')
        : '<div class="causal-empty-note">No edge attributes yet. Add key/value metadata if you want to annotate this pair.</div>';

    const connectionRows = _edgeEditDraft.connections.length > 0
        ? _edgeEditDraft.connections.map((link) => {
            const direction = `${link.source} → ${link.target}`;
            const typeOptions = edgeTypeOptions().map((type) => `<option value="${type}"${link.type === type ? ' selected' : ''}>${type}</option>`).join('');
            const sourceOptions = [group.nodeA, group.nodeB].map((node) => `<option value="${node}"${link.source === node ? ' selected' : ''}>${node}</option>`).join('');
            const targetOptions = [group.nodeA, group.nodeB].map((node) => `<option value="${node}"${link.target === node ? ' selected' : ''}>${node}</option>`).join('');
            const valueTone = Number(link.value) >= 0 ? ' causal-inline-good' : ' causal-inline-bad';
            return `
                <div class="causal-connection-editor" data-conn-row data-id="${link.draftId}">
                    <div class="causal-connection-editor-head">
                        <div class="causal-connection-title">${escH(direction)}</div>
                        <button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-conn="${link.draftId}">Remove</button>
                    </div>
                    <div class="causal-connection-grid">
                        <label class="causal-field-stack">
                            <span>From</span>
                            <select class="modal-select" data-role="source">${sourceOptions}</select>
                        </label>
                        <label class="causal-field-stack">
                            <span>To</span>
                            <select class="modal-select" data-role="target">${targetOptions}</select>
                        </label>
                        <label class="causal-field-stack">
                            <span>Lag</span>
                            <input class="modal-input" data-role="lag" type="number" min="0" step="1" value="${Number.isFinite(link.lag) ? link.lag : 0}">
                        </label>
                        <label class="causal-field-stack">
                            <span>Type</span>
                            <select class="modal-select" data-role="type">${typeOptions}</select>
                        </label>
                        <label class="causal-field-stack">
                            <span>Value</span>
                            <input class="modal-input${valueTone}" data-role="value" type="number" step="0.001" value="${Number.isFinite(link.value) ? link.value : 0}">
                        </label>
                        <label class="causal-field-stack">
                            <span>P-value</span>
                            <input class="modal-input" data-role="pvalue" type="number" min="0" step="0.0001" value="${Number.isFinite(link.pvalue) ? link.pvalue : 0}">
                        </label>
                    </div>
                </div>`;
        }).join('')
        : '<div class="causal-empty-note">No raw connections yet. Add one to keep this pair edge in the exported graph.</div>';

    bodyEl.innerHTML = `
        <section class="causal-edit-hero causal-edit-hero-edge">
            <div class="causal-edit-kicker">Pair edge</div>
            <div class="causal-edit-name">${escH(group.nodeA)} <span class="causal-edit-arrow">${escH(edgeDirectionGlyph(group))}</span> ${escH(group.nodeB)}</div>
            <div class="causal-pill-row">
                <span class="causal-pill" title="${escH(edgeMetricTip('summary'))}">${escH(edgeSummaryType(group))}</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('tau'))}">τ ${escH(compactLagSummary(group))}</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('raw'))}">${group.connections.length} links</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('pmin'))}">pmin ${Number.isFinite(group.minPValue) ? group.minPValue.toFixed(4) : 'n/a'}</span>
            </div>
        </section>
        <section class="causal-edit-section">
            <div class="causal-edit-section-head">
                <span>Connections</span>
                <button class="btn btn-ghost btn-sm causal-inline-add" type="button" data-add-conn>Add connection</button>
            </div>
            <div class="causal-connection-list">${connectionRows}</div>
            <div class="causal-field-hint">Edit lag-specific links directly here. The graph still renders one visual edge per node pair.</div>
        </section>
        <section class="causal-edit-section">
            <div class="causal-edit-section-head">
                <span>Edge attributes</span>
                <button class="btn btn-ghost btn-sm causal-inline-add" type="button" data-add-attr>Add attribute</button>
            </div>
            <div class="causal-inline-editor-list">${attrRows}</div>
            <div class="causal-field-hint">Attribute values are saved as strings, numbers, booleans, null, or JSON when they look like valid literals.</div>
        </section>
    `;
    bindEdgeDraftControls();
}

function openEditPanel(target: EditTarget): void {
    const panel = document.getElementById('causal-edit-panel') as HTMLElement | null;
    const titleEl = document.getElementById('causal-edit-title') as HTMLElement | null;
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!panel || !bodyEl) return;

    _editTarget = target;
    panel.hidden = false;

    if (target.kind === 'node') {
        const col = target.col;
        const label = _nodeLabels.get(col) || col;
        const color = _chipColors.get(col) || '#00a8ff';
        if (titleEl) titleEl.textContent = `Node: ${col}`;
        bodyEl.innerHTML = `
          <label class="causal-field-row">
            <span>Label</span>
            <input type="text" id="ep-node-label" class="modal-input" style="flex:1" value="${escH(label)}">
          </label>
          <label class="causal-field-row">
            <span>Color</span>
            <input type="color" id="ep-node-color" value="${escH(color)}" style="width:36px;height:28px;padding:2px;">
          </label>
          <label class="causal-field-stack">
            <span>Attributes (JSON)</span>
            <textarea id="ep-node-attrs" class="modal-input causal-field-textarea">${escH(attrsToJson(_nodeAttrs.get(col)))}</textarea>
            <span class="causal-field-hint">Store any node metadata here. These attributes are included in JSON and torch export.</span>
          </label>
        `;
        return;
    }

    const group = getPairGroup(target.key);
    if (!group) {
        closeEditPanel();
        return;
    }
    _edgeEditDraft = {
        key: group.key,
        nodeA: group.nodeA,
        nodeB: group.nodeB,
        attrs: Object.entries(_pairAttrs.get(group.key) ?? {}).map(([key, value]) => ({
            draftId: nextDraftId('attr'),
            key,
            value: stringifyDraftValue(value),
        })),
        connections: group.connections.map((link) => ({
            draftId: nextDraftId('conn'),
            ...link,
        })),
    };
    if (titleEl) titleEl.textContent = `Pair Edge: ${group.nodeA} - ${group.nodeB}`;
    renderEdgeDraftEditor();
}

function parseAttrsJson(raw: string, kind: string): Record<string, unknown> | null {
    try {
        const parsed = raw.trim() ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setStatus(`${kind} attributes must be a JSON object.`);
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch (error) {
        setStatus(`${kind} attributes JSON is invalid: ${(error as Error).message}`);
        return null;
    }
}

function replacePairConnections(oldKey: string, nextConnections: CausalLink[]): void {
    _currentLinks = _currentLinks.filter((link) => link.source === link.target || pairKey(link.source, link.target) !== oldKey);
    _currentLinks.push(...nextConnections);
}

function applyEditPanel(): void {
    if (!_editTarget) return;
    if (_editTarget.kind === 'node') {
        const col = _editTarget.col;
        const labelInput = document.getElementById('ep-node-label') as HTMLInputElement | null;
        const colorInput = document.getElementById('ep-node-color') as HTMLInputElement | null;
        const attrsInput = document.getElementById('ep-node-attrs') as HTMLTextAreaElement | null;
        const attrs = parseAttrsJson(attrsInput?.value || '{}', 'Node');
        if (!attrs) return;
        if (labelInput?.value.trim()) _nodeLabels.set(col, labelInput.value.trim());
        if (colorInput?.value) _chipColors.set(col, colorInput.value);
        _nodeAttrs.set(col, attrs);
        closeEditPanel();
        renderEChartsGraph();
        return;
    }

    syncEdgeDraftFromDom();
    if (!_edgeEditDraft) return;

    const attrs: PairAttributes = {};
    for (const entry of _edgeEditDraft.attrs) {
        const key = entry.key.trim();
        if (!key) continue;
        attrs[key] = parseLooseValue(entry.value);
    }

    const connections: CausalLink[] = [];
    for (const link of _edgeEditDraft.connections) {
        const source = String(link.source || '');
        const target = String(link.target || '');
        const lag = Number(link.lag);
        const value = Number(link.value);
        const pvalue = Number(link.pvalue);
        if (!source || !target || source === target) {
            setStatus('Each connection needs two different endpoints.');
            return;
        }
        if (!_currentColumns.includes(source) || !_currentColumns.includes(target)) {
            setStatus('Connection endpoints must exist in the current graph.');
            return;
        }
        if (pairKey(source, target) !== _edgeEditDraft.key) {
            setStatus('Connections in this editor must stay inside the same node pair.');
            return;
        }
        if (!Number.isFinite(lag) || lag < 0 || !Number.isFinite(value) || !Number.isFinite(pvalue)) {
            setStatus('Each connection needs a valid lag, value, and p-value.');
            return;
        }
        connections.push({
            source,
            target,
            lag: Math.trunc(Math.max(0, lag)),
            type: String(link.type || '-->'),
            value,
            pvalue,
        });
    }

    replacePairConnections(_editTarget.key, connections);
    _pairAttrs.delete(_editTarget.key);
    if (Object.keys(attrs).length > 0) _pairAttrs.set(_edgeEditDraft.key, attrs);
    closeEditPanel();
    renderEChartsGraph();
}

function closeEditPanel(): void {
    const panel = document.getElementById('causal-edit-panel') as HTMLElement | null;
    if (panel) panel.hidden = true;
    _editTarget = null;
    _edgeEditDraft = null;
}

function deleteTarget(target: EditTarget): void {
    if (target.kind === 'node') {
        const col = target.col;
        _currentColumns = _currentColumns.filter((value) => value !== col);
        _currentLinks = _currentLinks.filter((link) => link.source !== col && link.target !== col);
        _selectedColumns.delete(col);
        _nodeLabels.delete(col);
        _nodeAttrs.delete(col);
        _nodePositions.delete(col);
        for (const key of Array.from(_pairAttrs.keys())) {
            if (key.startsWith(`${col}||`) || key.endsWith(`||${col}`)) _pairAttrs.delete(key);
        }
    } else {
        replacePairConnections(target.key, []);
        _pairAttrs.delete(target.key);
    }
    closeEditPanel();
    renderEChartsGraph();
    const groups = listPairGroups();
    setStatus(`${_currentColumns.length} nodes · ${groups.length} pair edges · ${_currentLinks.length} raw connections`);
}

function buildLegendGraphic(): any[] {
    const items = [
        { color: 'hsla(200,80%,60%,0.85)', dash: false, label: 'Mostly positive effect' },
        { color: 'hsla(10,80%,60%,0.85)', dash: false, label: 'Mostly negative effect' },
        { color: 'rgba(120,139,174,0.58)', dash: false, label: 'Mixed directions' },
        { color: 'rgba(180,160,80,0.62)', dash: true, label: 'Undirected / uncertain' },
    ];
    return items.map((item, idx) => ({
        type: 'group',
        bottom: 14 + (items.length - 1 - idx) * 16,
        left: 14,
        children: [
            {
                type: 'line',
                shape: { x1: 0, y1: 0, x2: 22, y2: 0 },
                style: { stroke: item.color, lineWidth: 2, lineDash: item.dash ? [5, 3] : undefined },
            },
            {
                type: 'text',
                left: 28,
                top: -6,
                style: { text: item.label, fill: '#788BAE', fontSize: 10 },
            },
        ],
    }));
}

function buildPairEdge(group: PairEdgeGroup): any {
    const absVal = Math.min(1, Math.abs(group.meanValue || 0));
    let color = group.meanValue >= 0 ? `hsla(200,80%,60%,${0.34 + absVal * 0.46})` : `hsla(10,80%,60%,${0.34 + absVal * 0.46})`;
    let lineType: 'solid' | 'dashed' = 'solid';
    if (group.direction === 'mixed') color = 'rgba(120,139,174,0.58)';
    if (group.hasUndirected || group.hasAmbiguous) {
        color = 'rgba(180,160,80,0.62)';
        lineType = 'dashed';
    }
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
        _attrs: _pairAttrs.get(group.key) ?? {},
        lineStyle: {
            color,
            width,
            type: lineType,
            opacity: 0.86,
            curveness: group.direction === 'mixed' ? 0.1 : 0.14,
        },
        edgeSymbol: symbols,
        edgeSymbolSize: symbolSize,
        emphasis: {
            lineStyle: {
                width: width + 1.2,
                opacity: 1,
            },
        },
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
    return `<b>${escH(label)}</b><br/>` +
        `Column: ${escH(col)}<br/>` +
        `dtype: ${escH(dtype)}<br/>` +
        `Incoming raw links: ${incoming} · Outgoing raw links: ${outgoing}` +
        (self ? ` · Self-links: ${self}` : '') +
        `<br/>Attributes: ${attrKeys.length}` +
        `<br/><span style="font-size:10px;color:#788bae;">Drag moves only this node. Double-click rename. Right-click edit/delete.</span>`;
}

function edgeTooltip(group: PairEdgeGroup): string {
    const pill = (label: string, kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue', tone = 'rgba(255,255,255,0.05)') =>
        `<span class="causal-metric-pill" title="${escH(edgeMetricTip(kind))}" style="background:${tone};">${label}</span>`;
    const rows = group.connections.slice(0, 6).map((link) => {
        const direction = resolveLinkDirection(link);
        const valueTone = Number(link.value) >= 0 ? 'rgba(74,195,232,0.18)' : 'rgba(249,115,22,0.18)';
        return `<div class="causal-edge-tip-row">
                    <div class="causal-edge-tip-row-title">
                        <span>${escH(direction.source)}</span>
                        <span class="causal-connection-arrow">→</span>
                        <span>${escH(direction.target)}</span>
                    </div>
                    <div class="causal-edge-tip-pill-row">
                        ${pill(`τ=${link.lag}`, 'tau')}
                        ${pill(escH(link.type), 'type')}
                        ${pill(`val=${Number(link.value).toFixed(3)}`, 'value', valueTone)}
                        ${pill(`p=${Number(link.pvalue).toFixed(4)}`, 'pvalue')}
                    </div>
                </div>`;
    });
    const extra = group.connections.length > 6 ? `<div class="causal-edge-tip-extra">+ ${group.connections.length - 6} more raw connections in the edit panel.</div>` : '';
    return `<div class="causal-edge-tip">
            <div class="causal-edge-tip-kicker">Pair edge</div>
            <div class="causal-edge-tip-title">${escH(group.nodeA)} <span class="causal-edit-arrow">${escH(edgeDirectionGlyph(group))}</span> ${escH(group.nodeB)}</div>
            <div class="causal-edge-tip-pill-row causal-edge-tip-pill-row-summary">
                ${pill(escH(edgeSummaryType(group)), 'summary')}
                ${pill(`τ ${escH(compactLagSummary(group))}`, 'tau')}
                ${pill(`raw ${group.connections.length}`, 'raw')}
                ${pill(`pmin ${Number.isFinite(group.minPValue) ? group.minPValue.toFixed(4) : 'n/a'}`, 'pmin')}
            </div>
            ${rows.join('')}
            ${extra}
            <div class="causal-edge-tip-foot">Right-click to edit this pair edge and its raw lag-specific links.</div>
        </div>`;
}

function renderEChartsGraph(): void {
    if (!_eChart) return;
    captureRenderedNodePositions();
    seedNodePositions();
    const selfLoops = collectSelfLoops();
    const groups = listPairGroups();

    const nodes = _currentColumns.map((col) => {
        const pos = _nodePositions.get(col) ?? { x: 80, y: 80 };
        const label = _nodeLabels.get(col) || col;
        const borderColor = _chipColors.get(col) || 'rgba(0,168,255,0.6)';
        return {
            id: col,
            name: label,
            x: pos.x,
            y: pos.y,
            fixed: true,
            draggable: true,
            symbolSize: 48,
            label: {
                show: true,
                position: 'inside' as const,
                color: '#e0e6f0',
                fontSize: 10,
                fontWeight: 'bold' as const,
                formatter: (params: any) => {
                    const value = String(params.data.name || '');
                    return value.length > 8 ? `${value.slice(0, 7)}…` : value;
                },
            },
            itemStyle: {
                color: 'rgba(14,18,32,0.92)',
                borderColor,
                borderWidth: 2,
            },
            emphasis: {
                itemStyle: {
                    borderColor: '#00d4ff',
                    borderWidth: 3,
                    shadowBlur: 14,
                    shadowColor: 'rgba(0,212,255,0.45)',
                },
            },
        };
    });

    _eChart.setOption({
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
            trigger: 'item',
            enterable: true,
            confine: true,
            backgroundColor: 'rgba(14,18,32,0.95)',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            padding: [8, 12],
            textStyle: { color: '#e0e6f0', fontSize: 12 },
            formatter: (params: any) => {
                if (params.dataType === 'node') return nodeTooltip(String(params.data.id), selfLoops);
                if (params.dataType === 'edge') {
                    const group = getPairGroup(String(params.data._key));
                    if (group) return edgeTooltip(group);
                }
                return '';
            },
        },
        graphic: buildLegendGraphic(),
        series: [{
            type: 'graph',
            layout: 'none',
            data: nodes,
            links: groups.map(buildPairEdge),
            roam: true,
            draggable: true,
            symbol: 'circle',
            edgeLabel: {
                show: true,
                position: 'middle',
                distance: 14,
                rotate: false,
                color: '#dfe7f5',
                fontSize: groups.length > 8 ? 9 : 10,
                lineHeight: groups.length > 8 ? 11 : 12,
                fontWeight: 600,
                backgroundColor: 'rgba(7, 10, 18, 0.96)',
                borderColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                borderRadius: 14,
                padding: [6, 10],
                shadowBlur: 16,
                shadowColor: 'rgba(0,0,0,0.32)',
                formatter: (params: any) => String(params.data?._labelText || ''),
            },
            emphasis: { focus: 'adjacency' },
        }],
    }, true);
}

function aggregateExportEdges(): Array<Record<string, unknown>> {
    return listPairGroups().map((group) => ({
        key: group.key,
        node_a: group.nodeA,
        node_b: group.nodeB,
        direction_summary: edgeSummaryType(group),
        lags: group.lags,
        connection_count: group.connections.length,
        mean_value: group.meanValue,
        min_pvalue: Number.isFinite(group.minPValue) ? group.minPValue : null,
        attrs: _pairAttrs.get(group.key) ?? {},
        connections: group.connections,
    }));
}

function handleExport(fmt: string): void {
    if (_currentColumns.length === 0) {
        setStatus('Nothing to export. Compute a graph or add nodes first.');
        return;
    }
    let content = '';
    let filename = 'causal_graph.json';
    let mime = 'application/json';

    if (fmt === 'glm') {
        content = exportGLM();
        filename = 'causal_glm_formulas.txt';
        mime = 'text/plain';
    } else if (fmt === 'torch') {
        content = exportTorchGeometric();
        filename = 'causal_torch_geometric.json';
    } else {
        content = exportJSON();
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    requestAnimationFrame(() => {
        anchor.click();
        window.setTimeout(() => {
            anchor.remove();
            URL.revokeObjectURL(url);
        }, 250);
    });
    setStatus(`Exported ${filename}`);
}

function exportJSON(): string {
    const nodes = _currentColumns.map((col) => ({
        id: col,
        label: _nodeLabels.get(col) || col,
        color: _chipColors.get(col) || null,
        attrs: _nodeAttrs.get(col) ?? {},
        position: _nodePositions.get(col) ?? null,
    }));
    return JSON.stringify({
        meta: {
            tau_max: _currentTauMax,
            rendered_edge_mode: 'one_edge_per_node_pair',
            references: {
                overview: 'Runge et al. Nat Rev Earth Environ (2023)',
                pcmci: 'Runge et al. Science Advances (2019)',
                pcmciplus: 'Runge UAI (2020)',
                lpcmci: 'Gerhardus and Runge NeurIPS (2020)',
            },
        },
        nodes,
        edges: aggregateExportEdges(),
        raw_links: _currentLinks,
    }, null, 2);
}

function exportGLM(): string {
    const lines: string[] = [
        '# GLM-style formulas derived from raw directed causal links',
        '# Rendered graph is aggregated to one pair edge per node pair; formulas still use raw per-lag links.',
        `# tau_max = ${_currentTauMax}`,
        '',
    ];

    const directed = _currentLinks
        .filter((link) => link.source !== link.target)
        .filter((link) => link.type === '-->' || link.type === 'o->' || link.type === '<--' || link.type === '<-o')
        .map((link) => ({
            ...resolveLinkDirection(link),
            lag: link.lag,
            type: link.type,
            value: link.value,
            pvalue: link.pvalue,
        }));

    const byTarget = new Map<string, typeof directed>();
    _currentColumns.forEach((col) => byTarget.set(col, []));
    directed.forEach((link) => byTarget.get(link.target)?.push(link));

    for (const [target, items] of byTarget) {
        if (items.length === 0) continue;
        const lhs = _nodeLabels.get(target) || target;
        const rhs = items.map((link) => `${_nodeLabels.get(link.source) || link.source}_lag${link.lag}`).join(' + ');
        lines.push(`${lhs} ~ ${rhs}`);
    }

    const uncertain = aggregateExportEdges().filter((edge) => String(edge.direction_summary).includes('mixed') || String(edge.direction_summary).includes('undirected') || String(edge.direction_summary).includes('uncertain'));
    if (uncertain.length > 0) {
        lines.push('');
        lines.push('# Pair edges with mixed/uncertain directionality');
        uncertain.forEach((edge) => {
            lines.push(`# ${edge.node_a} - ${edge.node_b}: ${edge.direction_summary}; lags=${Array.isArray(edge.lags) ? edge.lags.join(',') : ''}`);
        });
    }

    return lines.join('\n');
}

function exportTorchGeometric(): string {
    const nodeIndex: Record<string, number> = {};
    _currentColumns.forEach((col, idx) => { nodeIndex[col] = idx; });

    const groups = listPairGroups();
    const edgeIndexA: number[] = [];
    const edgeIndexB: number[] = [];
    const edgeAttr: number[][] = [];
    const edgeDetails = groups.map((group) => {
        edgeIndexA.push(nodeIndex[group.nodeA]);
        edgeIndexB.push(nodeIndex[group.nodeB]);
        edgeAttr.push([
            group.connections.length,
            group.lags.length ? Math.min(...group.lags) : 0,
            group.lags.length ? Math.max(...group.lags) : 0,
            group.meanValue,
            Number.isFinite(group.minPValue) ? group.minPValue : 1,
            edgeDirectionCode(group),
        ]);
        return {
            key: group.key,
            nodes: [group.nodeA, group.nodeB],
            attrs: _pairAttrs.get(group.key) ?? {},
            connections: group.connections,
        };
    });

    const nodeFeatures = _currentColumns.map((col) => ({
        index: nodeIndex[col],
        id: col,
        label: _nodeLabels.get(col) || col,
        attrs: _nodeAttrs.get(col) ?? {},
    }));

    return JSON.stringify({
        meta: {
            description: 'Aggregated pair-edge export for downstream graph modeling',
            edge_mode: 'one_edge_per_node_pair',
            tau_max: _currentTauMax,
            edge_attr_names: ['connection_count', 'min_lag', 'max_lag', 'mean_value', 'min_pvalue', 'direction_code'],
            direction_codes: {
                0: 'mixed_or_unknown',
                1: 'node_a_to_node_b',
                2: 'node_b_to_node_a',
                3: 'undirected_or_uncertain',
            },
        },
        node_features: nodeFeatures,
        edge_index: [edgeIndexA, edgeIndexB],
        edge_attr: edgeAttr,
        edge_details: edgeDetails,
        raw_links: _currentLinks,
    }, null, 2);
}

function escH(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function initCausalPage(deps: CausalDeps): void {
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
    const ctxMenu = document.getElementById('causal-ctx-menu') as HTMLElement | null;

    _chartEl = document.getElementById('causal-chart') as HTMLDivElement | null;
    if (!_chartEl || !columnsBar) return;

    renderColumnChips(deps, columnsBar);
    initInfoIcons();
    applyMethodControlState(methodSelect?.value || 'pcmci');
    void initChart();

    methodSelect?.addEventListener('change', () => applyMethodControlState(methodSelect.value));

    addEdgeBtn?.addEventListener('click', () => {
        _addEdgeMode = !_addEdgeMode;
        _addEdgeFirst = null;
        addEdgeBtn.classList.toggle('btn-accent', _addEdgeMode);
        addEdgeBtn.classList.toggle('btn-ghost', !_addEdgeMode);
        setStatus(_addEdgeMode
            ? 'Add-edge mode enabled. Click two nodes to create one pair edge with a default connection.'
            : 'Add-edge mode cancelled.');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && _addEdgeMode) {
            _addEdgeMode = false;
            _addEdgeFirst = null;
            if (addEdgeBtn) {
                addEdgeBtn.classList.remove('btn-accent');
                addEdgeBtn.classList.add('btn-ghost');
            }
            setStatus('Add-edge mode cancelled.');
        }
    });

    exportBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (exportMenu) exportMenu.hidden = !exportMenu.hidden;
    });

    exportMenu?.addEventListener('click', (event) => {
        event.stopPropagation();
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.causal-export-item');
        if (!button) return;
        exportMenu.hidden = true;
        handleExport(button.dataset.fmt || 'json');
    });

    document.addEventListener('click', () => {
        if (exportMenu) exportMenu.hidden = true;
        if (ctxMenu) ctxMenu.hidden = true;
    });

    document.getElementById('causal-ctx-edit')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) openEditPanel(_editTarget);
        if (ctxMenu) ctxMenu.hidden = true;
    });

    document.getElementById('causal-ctx-delete')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) deleteTarget(_editTarget);
        if (ctxMenu) ctxMenu.hidden = true;
    });

    document.getElementById('causal-edit-close')?.addEventListener('click', closeEditPanel);
    document.getElementById('causal-edit-apply')?.addEventListener('click', applyEditPanel);
    document.getElementById('causal-edit-delete')?.addEventListener('click', () => {
        if (_editTarget) deleteTarget(_editTarget);
    });

    computeBtn?.addEventListener('click', async () => {
        const meta = deps.getMetadata();
        const allSelected = Array.from(_selectedColumns);
        const numericSelected = allSelected.filter((col) => isNumericColumn(col, meta));
        const manualOnly = allSelected.filter((col) => !isNumericColumn(col, meta));

        if (numericSelected.length < 2) {
            setStatus('Select at least 2 numeric columns for computation. Non-numeric selections are allowed as manual/export nodes only.');
            return;
        }

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
            setProgress(0, `${methodLabel}: preparing`);
            const progressId = window.setInterval(() => {
                ticks += 1;
                const pct = Math.min(90, (usesPcStage ? 12 : 18) + ticks * 2);
                setProgress(pct, `${methodLabel}: ${usesPcStage && ticks < 14 ? 'parent selection' : 'conditional tests'}`);
            }, 320);

            const resp = await fetchCausalGraph(
                numericSelected,
                tauMax,
                alpha,
                method,
                5000,
                undefined,
                parseFloat((document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value || '0.2'),
                test,
                usesPcStage ? maxCondsDim : undefined,
                fdrMethod,
            );

            window.clearInterval(progressId);
            setProgress(100, `${methodLabel}: complete`);
            window.setTimeout(hideProgress, 800);

            const cols = [...resp.columns, ...manualOnly.filter((col) => !resp.columns.includes(col))];
            _currentColumns = cols;
            _currentLinks = resp.links;
            _currentTauMax = resp.tau_max;

            for (const col of cols) ensureNodeMetadata(col, meta, deps);
            renderEChartsGraph();

            const groups = listPairGroups();
            const manualText = manualOnly.length > 0 ? ` · ${manualOnly.length} manual/meta nodes` : '';
            setStatus(`${cols.length} nodes · ${groups.length} pair edges · ${resp.links.length} raw connections${manualText}`);
        } catch (error) {
            hideProgress();
            setStatus(`Error: ${(error as Error).message || 'failed'}`);
        } finally {
            deps.setLoading('causal-compute-btn', 'causal-loading', false, 'Compute');
        }
    });

    window.addEventListener('edatime:page-change', (event: any) => {
        if (event?.detail?.page === 'causal' && deps.getMetadata()) {
            renderColumnChips(deps, columnsBar);
            _eChart?.resize();
            if (_currentColumns.length > 0) renderEChartsGraph();
        }
    });
}
