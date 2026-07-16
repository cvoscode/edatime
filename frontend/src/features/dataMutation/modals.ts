import { createModalController } from '../../ui/shell/createModalController.js';
import { createDataMutationFeature } from './feature.js';
import { getDropdownValue } from '../../ui/primitives/Dropdown.js';
import type { WorkspaceStore } from '../../workspace/workspaceStore.js';
import type { CleaningPlanStore } from '../../cleaning/store.js';

const dataMutationFeature = createDataMutationFeature();

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

interface DataMutationModalDeps {
    refreshDataset: (options?: RefreshDatasetOptions) => Promise<void>;
}

interface TransformModalDeps extends DataMutationModalDeps {
    planStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
    onPlanChanged?: () => void;
}

interface OutlierModalDeps extends DataMutationModalDeps {
    workspace: Pick<WorkspaceStore, 'getSnapshot'>;
    planStore?: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>;
    onPlanChanged?: () => void;
}

export function initTransformModal(deps: TransformModalDeps): void {
    const applyBtn = document.getElementById('transform-apply-btn') as HTMLButtonElement | null;
    const exprInput = document.getElementById('transform-expression') as HTMLInputElement | null;
    const nameInput = document.getElementById('transform-output-name') as HTMLInputElement | null;
    const errorEl = document.getElementById('transform-error') as HTMLElement | null;

    const controller = createModalController({
        modalId: 'transform-modal',
        closeButtonIds: ['transform-close-btn', 'transform-cancel-btn'],
        onOpen: () => {
            if (errorEl) errorEl.textContent = '';
        },
    });

    applyBtn?.addEventListener('click', async () => {
        const expr = exprInput?.value?.trim();
        const name = nameInput?.value?.trim();
        if (!expr) {
            if (errorEl) errorEl.textContent = 'Expression is required.';
            return;
        }
        if (!name) {
            if (errorEl) errorEl.textContent = 'Output column name is required.';
            return;
        }
        if (errorEl) errorEl.textContent = '';

        try {
            if (applyBtn) {
                applyBtn.textContent = 'Adding…';
                applyBtn.disabled = true;
            }
            const planStore = deps.planStore;
            const plan = planStore?.getSnapshot();
            if (!planStore || !plan) throw new Error('Load a dataset before adding a derived column to the pipeline.');
            planStore.addStage({
                kind: 'derivedColumn',
                executionClass: 'polarsExpression',
                scope: 'schema',
                enabled: true,
                sourcePage: 'manual',
                label: `Derive ${name}`,
                expression: expr,
                outputColumn: name,
            });
            deps.onPlanChanged?.();
            controller.close();
        } catch (error: any) {
            if (errorEl) errorEl.textContent = error?.message || 'Could not add transform to the pipeline.';
        } finally {
            if (applyBtn) {
                applyBtn.textContent = 'Add to pipeline';
                applyBtn.disabled = false;
            }
        }
    });
}

export function initOutlierModal(deps: OutlierModalDeps): void {
    const openBtn = document.getElementById('outlier-open-btn');
    const applyBtn = document.getElementById('outlier-apply-btn') as HTMLButtonElement | null;
    const methodSelect = document.getElementById('outlier-method') as HTMLElement | null;
    const thresholdInput = document.getElementById('outlier-threshold') as HTMLInputElement | null;
    const errorEl = document.getElementById('outlier-error') as HTMLElement | null;
    const resultEl = document.getElementById('outlier-result') as HTMLElement | null;

    const controller = createModalController({
        modalId: 'outlier-modal',
        closeButtonIds: ['outlier-close-btn', 'outlier-cancel-btn'],
        onOpen: () => {
            if (errorEl) errorEl.textContent = '';
            if (resultEl) resultEl.textContent = '';
        },
    });

    openBtn?.addEventListener('click', () => {
        controller.open();
    });

    methodSelect?.addEventListener('change', () => {
        if (thresholdInput) {
            thresholdInput.value = getDropdownValue('outlier-method') === 'iqr' ? '1.5' : '3';
        }
    });

    applyBtn?.addEventListener('click', async () => {
        if (errorEl) errorEl.textContent = '';
        if (resultEl) resultEl.textContent = '';

        const method = getDropdownValue('outlier-method') || 'zscore';
        const threshold = Number.parseFloat(thresholdInput?.value || '3');
        const selectedColumns = deps.workspace.getSnapshot().selection.columns;

        try {
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = 'Proposing…';
            }
            const planStore = deps.planStore;
            const plan = planStore?.getSnapshot();
            if (!planStore || !plan) throw new Error('Load a dataset before adding an outlier proposal to the pipeline.');
            if (selectedColumns.length === 0) throw new Error('Select one or more numeric columns before proposing outlier ranges.');
            const methodName = method === 'iqr' ? 'iqr' : 'zscore';
            const proposal = await dataMutationFeature.proposeOutliers(plan, {
                columns: [...selectedColumns],
                method: methodName,
                threshold,
            });
            for (const range of proposal.ranges) {
                planStore.addStage({
                    kind: 'columnRange',
                    executionClass: 'polarsExpression',
                    scope: 'row',
                    enabled: true,
                    sourcePage: 'manual',
                    label: `Keep global ${proposal.method} inliers for ${range.column}`,
                    column: range.column,
                    from: range.from,
                    to: range.to,
                    mode: 'keepInside',
                    retainNulls: range.retainNulls,
                });
            }
            deps.onPlanChanged?.();
            if (resultEl) {
                resultEl.textContent = proposal.ranges.length === 0
                    ? 'No global bounds were needed for the selected columns; the pipeline is unchanged.'
                    : `Added ${proposal.ranges.length} global inlier range${proposal.ranges.length === 1 ? '' : 's'} to the Pipeline Workbench. Preview or materialize them there.`;
            }
        } catch (error: any) {
            if (errorEl) errorEl.textContent = error?.message || 'Could not propose outlier ranges.';
        } finally {
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Add outlier proposal';
            }
        }
    });
}
