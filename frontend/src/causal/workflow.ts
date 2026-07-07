/**
 * causal/workflow — workflow control helpers.
 *
 * Encapsulates:
 *   - Method-control enable/disable rules
 *   - Add-edge mode action wiring
 *   - Compute button request/response flow
 */

import { fetchCausalGraph } from '../services/api/index.js';
import { notifyCausalGraphUpdated } from './causalComparison.js';
import {
    _selectedColumns,
    _addEdgeMode,
    setAddEdgeMode,
    setAddEdgeFirst,
    setCurrentColumns,
    setCurrentLinks,
    setCurrentTauMax,
    isNumericColumn,
    ensureNodeMetadata,
} from './selectionState.js';
import { setProgress, hideProgress, setStatus } from './statusView.js';
import { initChart, renderEChartsGraph } from './graphView.js';
import type { CausalDeps } from './selectionState.js';
import { getDropdownValueFromElement, setDropdownDisabledForElement } from '../ui/primitives/Dropdown.js';

export const METHOD_PC_STAGE = new Set(['pcmci', 'pcmciplus', 'lpcmci']);

export function syncCausalGraphActionState(hasGraph: boolean): void {
    const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
    const exportBtn = document.getElementById('causal-export-btn') as HTMLButtonElement | null;
    const exportMenu = document.getElementById('causal-export-menu') as HTMLElement | null;
    const saveRunBtn = document.getElementById('causal-save-run-btn') as HTMLButtonElement | null;

    if (addEdgeBtn) addEdgeBtn.disabled = !hasGraph;
    if (exportBtn) exportBtn.disabled = !hasGraph;
    if (saveRunBtn) saveRunBtn.disabled = !hasGraph;
    if (!hasGraph && exportMenu) exportMenu.hidden = true;
}

// ─── Control helpers ─────────────────────────────────────────────────────────

function controlDecorators(control: HTMLElement | null): HTMLElement[] {
    if (!control) return [];
    const out: HTMLElement[] = [control];
    const prev = control.previousElementSibling as HTMLElement | null;
    const next = control.nextElementSibling as HTMLElement | null;
    if (prev) out.push(prev);
    if (next?.classList.contains('toolbar-info-icon')) out.push(next);
    return out;
}

export function setControlEnabled(control: HTMLElement | null, enabled: boolean, title: string): void {
    if (!control) return;
    if (control instanceof HTMLInputElement) control.disabled = !enabled;
    else setDropdownDisabledForElement(control, !enabled);
    control.title = enabled ? '' : title;
    for (const el of controlDecorators(control)) {
        el.classList.toggle('causal-setting-disabled', !enabled);
        if (!enabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
    }
}

export function applyMethodControlState(method: string): void {
    const pcAlphaInput = document.getElementById('causal-pc-alpha') as HTMLInputElement | null;
    const maxCondsInput = document.getElementById('causal-max-conds') as HTMLInputElement | null;
    const usesPcStage = METHOD_PC_STAGE.has(method);
    setControlEnabled(pcAlphaInput, usesPcStage, method.toUpperCase() + ' does not use PC alpha.');
    setControlEnabled(maxCondsInput, usesPcStage, method.toUpperCase() + ' does not use max conditioning sets.');
}

// ─── Add-edge mode ────────────────────────────────────────────────────────────

export function toggleAddEdgeMode(addEdgeBtn: HTMLButtonElement | null): void {
    setAddEdgeMode(!_addEdgeMode);
    setAddEdgeFirst(null);
    setStatus(_addEdgeMode ? 'Add-edge mode enabled. Click two nodes to connect them.' : 'Add-edge mode canceled.');
    if (addEdgeBtn) {
        addEdgeBtn.classList.toggle('btn-accent', !_addEdgeMode);
        addEdgeBtn.classList.toggle('btn-ghost', _addEdgeMode);
    }
}

export function cancelAddEdgeMode(addEdgeBtn: HTMLButtonElement | null): void {
    setAddEdgeMode(false);
    setAddEdgeFirst(null);
    setStatus('Add-edge mode canceled.');
    if (addEdgeBtn) {
        addEdgeBtn.classList.remove('btn-accent');
        addEdgeBtn.classList.add('btn-ghost');
    }
}

// ─── Compute button ───────────────────────────────────────────────────────────

export async function handleComputeClick(
    deps: CausalDeps,
    methodSelect: HTMLElement | null,
    tauInput: HTMLInputElement | null,
    alphaInput: HTMLInputElement | null,
    maxCondsInput: HTMLInputElement | null,
    testSelect: HTMLElement | null,
    fdrSelect: HTMLElement | null,
    onComplete?: () => void,
): Promise<void> {
    const meta = deps.getMetadata();
    const allSelected = Array.from(_selectedColumns);
    const numericSelected = allSelected.filter((col) => isNumericColumn(col, meta));
    const manualOnly = allSelected.filter((col) => !isNumericColumn(col, meta));
    if (numericSelected.length < 2) {
        setStatus('Select at least 2 numeric columns before computing a causal graph.', 'error');
        return;
    }
    const method = getDropdownValueFromElement(methodSelect) || 'pcmci';
    const tauMax = parseInt(tauInput?.value || '3', 10);
    const alpha = parseFloat(alphaInput?.value || '0.05');
    const test = getDropdownValueFromElement(testSelect) || 'par_corr';
    const maxCondsDim = maxCondsInput?.value ? parseInt(maxCondsInput.value, 10) : undefined;
    const fdrMethod = getDropdownValueFromElement(fdrSelect) || 'none';
    const methodLabel = method.toUpperCase().replace('PCMCIPLUS', 'PCMCI+');
    const usesPcStage = METHOD_PC_STAGE.has(method);
    let ticks = 0;
    // Abort-before-new: cancel any in-flight compute before starting a new one
    // so a fast-clicking user does not pile up parallel causal runs.
    if (causalComputeController) causalComputeController.abort();
    causalComputeController = new AbortController();
    const signal = causalComputeController.signal;
    let progressId: number | undefined;
    try {
        deps.setLoading('causal-compute-btn', 'causal-loading', true, 'Compute');
        setStatus(`${methodLabel}: running causal discovery...`);
        setProgress(0, methodLabel + ': preparing');
        progressId = window.setInterval(() => {
            ticks += 1;
            const pct = Math.min(90, (usesPcStage ? 12 : 18) + ticks * 2);
            setProgress(pct, methodLabel + ': ' + (usesPcStage && ticks < 14 ? 'parent selection' : 'conditional tests'));
        }, 320);
        const resp = await fetchCausalGraph(numericSelected, tauMax, alpha, method, 5000, signal,
            parseFloat((document.getElementById('causal-pc-alpha') as HTMLInputElement | null)?.value || '0.2'),
            test, usesPcStage ? maxCondsDim : undefined, fdrMethod);
        setProgress(100, methodLabel + ': complete');
        window.setTimeout(hideProgress, 800);
        const cols = [...resp.columns, ...manualOnly.filter((col) => !resp.columns.includes(col))];
        setStatus(`${methodLabel}: graph updated with ${cols.length} nodes and ${resp.links.length} links.`, 'success');
        setCurrentColumns(cols);
        setCurrentLinks(resp.links);
        setCurrentTauMax(resp.tau_max);
        syncCausalGraphActionState(resp.links.length > 0 && cols.length >= 2);
        notifyCausalGraphUpdated(cols, resp.links);
        window.dispatchEvent(new CustomEvent('edatime:workflow-refresh'));
        for (const col of cols) ensureNodeMetadata(col, meta, deps);
        await initChart();
        renderEChartsGraph();
        onComplete?.();
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            // Superseded by a newer compute run; the newer run owns status UI.
            return;
        }
        hideProgress();
        setStatus(error instanceof Error ? error.message : 'Causal discovery failed.', 'error');
        onComplete?.();
    } finally {
        // Always clear the progress interval, even when aborted.
        if (progressId !== undefined) {
            window.clearInterval(progressId);
            progressId = undefined;
        }
        deps.setLoading('causal-compute-btn', 'causal-loading', false, 'Compute');
    }
}

/** Module-level controller for the latest causal compute run. */
let causalComputeController: AbortController | null = null;

/** Test-only: reset the causal compute controller between test runs. */
export function __resetCausalComputeControllerForTests(): void {
    if (causalComputeController) causalComputeController.abort();
    causalComputeController = null;
}
