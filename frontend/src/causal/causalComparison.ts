/**
 * Causal run comparison for EdaTime (Feature 8).
 *
 * Allows users to save causal runs (with their parameters and edge set)
 * and compare them side-by-side, highlighting added/removed/changed edges.
 */

import { toast } from '../utils/toast.js';

export interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

export interface SavedCausalRun {
    id: string;
    label: string;
    timestamp: number;
    method: string;
    test: string;
    tauMax: number;
    alpha: number;
    columns: string[];
    links: CausalLink[];
}

interface ChangedLink {
    key: string;
    a: CausalLink;
    b: CausalLink;
    changes: string[];
}

const STORAGE_KEY = 'edatime-causal-runs';
const NUMERIC_CHANGE_EPSILON = 1e-6;
let _savedRuns: SavedCausalRun[] = [];

function generateId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function loadSavedRuns(): SavedCausalRun[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        _savedRuns = Array.isArray(parsed) ? parsed : [];
    } catch {
        _savedRuns = [];
    }
    return _savedRuns;
}

function persistRuns(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_savedRuns));
    } catch { /* quota exceeded */ }
}

export function saveRun(
    links: CausalLink[],
    columns: string[],
    params: { method: string; test: string; tauMax: number; alpha: number },
    label?: string,
): SavedCausalRun {
    const run: SavedCausalRun = {
        id: generateId(),
        label: label || `${params.method} τ=${params.tauMax} α=${params.alpha}`,
        timestamp: Date.now(),
        ...params,
        columns: [...columns],
        links: links.map((l) => ({ ...l })),
    };
    _savedRuns.unshift(run); // newest first
    if (_savedRuns.length > 20) _savedRuns = _savedRuns.slice(0, 20); // cap at 20
    persistRuns();
    return run;
}

export function deleteRun(id: string): void {
    _savedRuns = _savedRuns.filter((r) => r.id !== id);
    persistRuns();
}

export function clearAllRuns(): void {
    _savedRuns = [];
    persistRuns();
}

/** Compute edge diff between two runs.
 * Returns sets of: added (in B, not in A), removed (in A, not in B), changed. */
function edgeDiff(runA: SavedCausalRun, runB: SavedCausalRun) {
    const keyA = new Map<string, CausalLink>();
    const keyB = new Map<string, CausalLink>();

    for (const l of runA.links) keyA.set(`${l.source}→${l.target}@${l.lag}`, l);
    for (const l of runB.links) keyB.set(`${l.source}→${l.target}@${l.lag}`, l);

    const added: CausalLink[] = [];
    const removed: CausalLink[] = [];
    const changed: ChangedLink[] = [];

    const numbersDiffer = (left: number, right: number): boolean => {
        if (!Number.isFinite(left) && !Number.isFinite(right)) return false;
        if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
        return Math.abs(left - right) > NUMERIC_CHANGE_EPSILON;
    };

    for (const [k, lb] of keyB) {
        if (keyA.has(k)) {
            const la = keyA.get(k)!;
            const changes: string[] = [];
            if (la.type !== lb.type) changes.push(`Type: ${la.type} → ${lb.type}`);
            if (numbersDiffer(la.value, lb.value)) changes.push(`Strength: ${formatDiffMetric(la.value)} → ${formatDiffMetric(lb.value)}`);
            if (numbersDiffer(la.pvalue, lb.pvalue)) changes.push(`p-value: ${formatDiffMetric(la.pvalue)} → ${formatDiffMetric(lb.pvalue)}`);
            if (changes.length > 0) changed.push({ key: k, a: la, b: lb, changes });
        } else {
            added.push(lb);
        }
    }

    for (const [k, la] of keyA) {
        if (!keyB.has(k)) removed.push(la);
    }

    return { added, removed, changed };
}

function escHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDiffMetric(value: number): string {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
        ? value.toExponential(2)
        : value.toFixed(3);
}

function renderRunSelector(
    containerId: string,
    runs: SavedCausalRun[],
    selectedId: string | null,
    onSelect: (id: string) => void,
): void {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (runs.length === 0) {
        el.innerHTML = '<option value="">No saved runs</option>';
        return;
    }
    el.innerHTML = '<option value="">-- select run --</option>' +
        runs.map((r) => `<option value="${escHtml(r.id)}" ${r.id === selectedId ? 'selected' : ''}>${escHtml(r.label)} (${new Date(r.timestamp).toLocaleString()})</option>`).join('');
    el.addEventListener('change', () => {
        const val = (el as HTMLSelectElement).value;
        if (val) onSelect(val);
    });
}

function renderDiff(runA: SavedCausalRun, runB: SavedCausalRun): string {
    const { added, removed, changed } = edgeDiff(runA, runB);

    const linkRow = (l: CausalLink, cls: string, prefix: string) =>
        `<tr class="${cls}"><td>${prefix} ${escHtml(l.source)}</td><td>→</td><td>${escHtml(l.target)}</td><td>τ=${l.lag}</td><td>${escHtml(l.type)}</td><td>${l.pvalue?.toFixed(3) ?? '—'}</td></tr>`;

    const changedRows = changed.map((c) =>
        `<tr class="diff-changed"><td>${escHtml(c.a.source)}</td><td>→</td><td>${escHtml(c.a.target)}</td><td>τ=${c.a.lag}</td><td colspan="2">${c.changes.map((change) => escHtml(change)).join('<br>')}</td></tr>`,
    ).join('');

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
        return '<p style="color:var(--text-muted,#888);padding:8px 0">Graphs are identical (same edges).</p>';
    }

    return `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="color:var(--text-dim,#aaa)"><th>From</th><th></th><th>To</th><th>Lag</th><th>Type</th><th>p-value</th></tr></thead>
            <tbody>
                ${removed.map((l) => linkRow(l, 'diff-removed', '−')).join('')}
                ${added.map((l) => linkRow(l, 'diff-added', '+')).join('')}
                ${changedRows}
            </tbody>
        </table>
        <div style="font-size:11px;color:var(--text-dim,#aaa);margin-top:6px">
            <span style="color:#f44">−${removed.length} removed</span> &nbsp;
            <span style="color:#4c4">+${added.length} added</span> &nbsp;
            ${changed.length > 0 ? `<span style="color:#ffc041">${changed.length} changed edges</span>` : ''}
        </div>`;
}

let _compareRunAId: string | null = null;
let _compareRunBId: string | null = null;

export function initCausalComparison(): void {
    loadSavedRuns();

    // Save button handler (called after a successful Compute)
    document.getElementById('causal-save-run-btn')?.addEventListener('click', () => {
        // Gather parameters from the toolbar
        const method = (document.getElementById('causal-method-select') as HTMLSelectElement)?.value || 'pcmci';
        const test = (document.getElementById('causal-test-select') as HTMLSelectElement)?.value || 'par_corr';
        const tauMax = parseInt((document.getElementById('causal-tau-max') as HTMLInputElement)?.value || '3', 10);
        const alpha = parseFloat((document.getElementById('causal-alpha') as HTMLInputElement)?.value || '0.05');

        // Read current graph from a globally-exposed state
        const graphState = (window as any).__edatimeCausalGraph;
        if (!graphState || !graphState.links || graphState.links.length === 0) {
            toast('No causal graph to save. Run Compute first.', 'warning');
            return;
        }
        const run = saveRun(graphState.links, graphState.columns, { method, test, tauMax, alpha });
        toast(`Saved run "${run.label}"`, 'success');
        refreshCompareUI();
    });

    // Compare run selectors
    refreshCompareUI();

    document.getElementById('causal-compare-run-btn')?.addEventListener('click', () => {
        const a = _compareRunAId ? _savedRuns.find((r) => r.id === _compareRunAId) : null;
        const b = _compareRunBId ? _savedRuns.find((r) => r.id === _compareRunBId) : null;
        const results = document.getElementById('causal-compare-results');
        if (!a || !b) {
            toast('Select two runs to compare.', 'warning');
            return;
        }
        if (results) results.innerHTML = renderDiff(a, b);
    });

    document.getElementById('causal-compare-clear-btn')?.addEventListener('click', () => {
        if (confirm('Delete all saved causal runs?')) {
            clearAllRuns();
            refreshCompareUI();
            toast('All saved runs cleared.', 'success');
        }
    });
}

function refreshCompareUI(): void {
    renderRunSelector('causal-compare-run-a', _savedRuns, _compareRunAId, (id) => { _compareRunAId = id; });
    renderRunSelector('causal-compare-run-b', _savedRuns, _compareRunBId, (id) => { _compareRunBId = id; });

    const savedList = document.getElementById('causal-saved-runs-list');
    if (savedList) {
        if (_savedRuns.length === 0) {
            savedList.innerHTML = '<p style="color:var(--text-muted,#888);font-size:12px">No saved runs yet.</p>';
        } else {
            savedList.innerHTML = _savedRuns.map((r) => `
                <div class="causal-run-item" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">
                    <span>${escHtml(r.label)}</span>
                    <span style="color:var(--text-dim,#aaa)">${r.links.length} edges · ${new Date(r.timestamp).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-xs causal-run-delete-btn" data-run-id="${escHtml(r.id)}" type="button" title="Delete">✕</button>
                </div>`).join('');

            savedList.querySelectorAll<HTMLButtonElement>('.causal-run-delete-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    deleteRun(btn.dataset.runId!);
                    refreshCompareUI();
                });
            });
        }
    }
}

/** Expose current graph to the comparison module. Called by causalPage after each compute. */
export function notifyCausalGraphUpdated(columns: string[], links: CausalLink[]): void {
    (window as any).__edatimeCausalGraph = { columns, links };
}
