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
    _selectedColumns,
    _addEdgeMode,
} from './selectionState.js';

import { renderColumnChips } from './chipPanel.js';
import { scheduleCausalChartRefresh, setChartEl } from './graphView.js';
import { syncCausalEmptyState } from './statusView.js';
import { openEditPanel, bindEditPanelEvents } from './editPanel.js';
import { handleExport } from './export.js';
import { applyMethodControlState, toggleAddEdgeMode, cancelAddEdgeMode, handleComputeClick } from './workflow.js';

let _chartEl: HTMLDivElement | null = null;
let _activePopover: HTMLElement | null = null;

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
            () => syncCausalEmptyState(_currentColumns.length),
        );
    });

    window.addEventListener('edatime:page-change', (event: any) => {
        if (event?.detail?.page === 'causal' && deps.getMetadata()) {
            renderColumnChips(deps, columnsBar, openEditPanel);
            scheduleCausalChartRefresh();
            syncCausalEmptyState(_currentColumns.length);
        }
    });
}