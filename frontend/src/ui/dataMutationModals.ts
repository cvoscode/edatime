import { appState } from '../store/appStateCompat.js';
import { createModalController } from './shell/createModalController';
import { createDataMutationFeature } from '../features/dataMutation/entrypoint.js';
import { getDropdownValue } from './primitives/Dropdown.js';

const dataMutationFeature = createDataMutationFeature();

interface RefreshDatasetOptions {
    selectedColumn?: string;
}

interface DataMutationModalDeps {
    refreshDataset: (options?: RefreshDatasetOptions) => Promise<void>;
}

export function initTransformModal(deps: DataMutationModalDeps): void {
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
                applyBtn.textContent = 'Applying…';
                applyBtn.disabled = true;
            }
            await dataMutationFeature.runTransform(expr, name);
            controller.close();
            await deps.refreshDataset({ selectedColumn: name });
        } catch (error: any) {
            if (errorEl) errorEl.textContent = error?.message || 'Transform failed.';
        } finally {
            if (applyBtn) {
                applyBtn.textContent = 'Apply';
                applyBtn.disabled = false;
            }
        }
    });
}

export function initOutlierModal(deps: DataMutationModalDeps): void {
    const openBtn = document.getElementById('outlier-open-btn');
    const applyBtn = document.getElementById('outlier-apply-btn') as HTMLButtonElement | null;
    const methodSelect = document.getElementById('outlier-method') as HTMLElement | null;
    const thresholdInput = document.getElementById('outlier-threshold') as HTMLInputElement | null;
    const windowInput = document.getElementById('outlier-window') as HTMLInputElement | null;
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
        const windowSize = Number.parseInt(windowInput?.value || '0', 10);

        try {
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = 'Removing…';
            }

            const result = await dataMutationFeature.removeOutliers({
                columns: appState.selectedCols.length > 0 ? appState.selectedCols : null,
                method,
                threshold,
                window: windowSize > 0 ? windowSize : undefined,
            });

            if (resultEl) {
                resultEl.textContent = `Removed ${result.rows_removed} rows (${result.rows_before} → ${result.rows_after})`;
            }
            await deps.refreshDataset();
        } catch (error: any) {
            if (errorEl) errorEl.textContent = error?.message || 'Outlier removal failed.';
        } finally {
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.textContent = 'Remove Outliers';
            }
        }
    });
}
