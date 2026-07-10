/**
 * causal/causalPage — orchestration layer.
 * Delegates chart lifecycle to graphView, edit UI to editPanel,
 * column chips to chipPanel, status/progress to statusView,
 * export to export.ts, workflow to workflow.ts, and runtime to runtime.ts.
 */
import './runtime.js'; // bootstraps page lifecycle before first edatime:page-change event

export type { CausalDeps } from './selectionState.js';
export type { MetadataColumn, CausalMetadata } from './selectionState.js';

import {
    _currentColumns,
    _currentLinks,
    _selectedColumns,
    _addEdgeMode,
    workspaceMetadata,
    workspaceNumericColumns,
    type CausalDeps,
} from './selectionState.js';

import { renderColumnChips } from './chipPanel.js';
import { scheduleCausalChartRefresh, setChartEl } from './graphView.js';
import { syncCausalEmptyState } from './statusView.js';
import { openEditPanel, bindEditPanelEvents } from './editPanel.js';
import { handleExport } from './export.js';
import { initCausalComparison } from './causalComparison.js';
import { applyMethodControlState, toggleAddEdgeMode, cancelAddEdgeMode, handleComputeClick, syncCausalGraphActionState } from './workflow.js';
import { getDropdownValue } from '../ui/primitives/Dropdown.js';
import { bindInfoPopovers } from '../ui/infoPopovers.js';

let _chartEl: HTMLDivElement | null = null;

function seedSelectedColumnsFromDataset(deps: CausalDeps): void {
    if (_selectedColumns.size > 0) return;
    const numericSet = new Set(workspaceNumericColumns(deps));
    const restored = deps.workspace.getSnapshot().selection.columns.filter((col) => numericSet.has(col));
    if (restored.length === 0) return;
    for (const col of restored) {
        _selectedColumns.add(col);
    }
}

export function initCausalPage(deps: CausalDeps): void {
    const methodSelect = document.getElementById('causal-method-select') as HTMLElement | null;
    const testSelect = document.getElementById('causal-test-select') as HTMLElement | null;
    const tauInput = document.getElementById('causal-tau-max') as HTMLInputElement | null;
    const alphaInput = document.getElementById('causal-alpha') as HTMLInputElement | null;
    const maxCondsInput = document.getElementById('causal-max-conds') as HTMLInputElement | null;
    const fdrSelect = document.getElementById('causal-fdr-select') as HTMLElement | null;
    const computeBtn = document.getElementById('causal-compute-btn') as HTMLButtonElement | null;
    const columnsBar = document.getElementById('causal-columns-bar') as HTMLElement | null;
    const addEdgeBtn = document.getElementById('causal-add-edge-btn') as HTMLButtonElement | null;
    const exportBtn = document.getElementById('causal-export-btn') as HTMLButtonElement | null;
    const exportMenu = document.getElementById('causal-export-menu') as HTMLElement | null;

    _chartEl = document.getElementById('causal-chart') as HTMLDivElement | null;
    setChartEl(_chartEl);
    if (!_chartEl || !columnsBar) return;

    bindEditPanelEvents();
    initCausalComparison();
    seedSelectedColumnsFromDataset(deps);
    renderColumnChips(deps, columnsBar, openEditPanel);
    syncCausalEmptyState(_selectedColumns.size);
    bindInfoPopovers();
    applyMethodControlState(getDropdownValue('causal-method-select') || 'pcmci');
    syncCausalGraphActionState(_currentLinks.length > 0 && _currentColumns.length >= 2);
    scheduleCausalChartRefresh();

    window.addEventListener('edatime:causal-preselect', ((e: CustomEvent) => {
        const cols: string[] = e.detail?.columns || [];
        if (cols.length === 0) return;
        _selectedColumns.clear();
        for (const c of cols) _selectedColumns.add(c);
        renderColumnChips(deps, columnsBar, openEditPanel);
        syncCausalEmptyState(_selectedColumns.size);
    }) as EventListener);

    methodSelect?.addEventListener('change', () => applyMethodControlState(getDropdownValue('causal-method-select') || 'pcmci'));

    addEdgeBtn?.addEventListener('click', () => {
        toggleAddEdgeMode(addEdgeBtn);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && _addEdgeMode) {
            cancelAddEdgeMode(addEdgeBtn);
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
        await handleComputeClick(
            deps,
            methodSelect,
            tauInput,
            alphaInput,
            maxCondsInput,
            testSelect,
            fdrSelect,
            () => syncCausalEmptyState(_selectedColumns.size),
        );
    });

    window.addEventListener('edatime:page-change', (event: any) => {
        if (event?.detail?.page === 'causal' && workspaceMetadata(deps)) {
            seedSelectedColumnsFromDataset(deps);
            renderColumnChips(deps, columnsBar, openEditPanel);
            scheduleCausalChartRefresh();
            syncCausalEmptyState(_selectedColumns.size);
        }
    });
}
