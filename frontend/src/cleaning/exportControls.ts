import { exportCleaningBundle, exportCleaningCode, exportCleaningData, exportCleaningPlan } from './api.js';
import type { CleaningPlan } from './types.js';
import { downloadBlob } from '../utils/dom.js';

/** Shared exports always capture the current complete plan at the time of the click. */
export function createPipelineExportControls(getPlan: () => CleaningPlan | null): HTMLElement {
    const root = document.createElement('section');
    root.className = 'pipeline-exports';
    root.setAttribute('aria-label', 'Export dataset and pipeline');
    const actions = document.createElement('div');
    actions.className = 'pipeline-workbench__export-actions';
    const status = document.createElement('p');
    status.className = 'prepare-workspace__policy-status';
    status.setAttribute('aria-live', 'polite');
    const exports: Array<[string, string, (plan: CleaningPlan) => Promise<Blob>]> = [
        ['Download dataset (Parquet)', 'edatime_prepared.parquet', exportCleaningData],
        ['Export plan JSON', 'edatime_cleaning_plan.json', exportCleaningPlan],
        ['Export Python', 'apply_edatime_plan.py', (plan) => exportCleaningCode(plan, 'python')],
        ['Export Rust', 'apply_edatime_plan.rs', (plan) => exportCleaningCode(plan, 'rust')],
        ['Export reproducibility bundle', 'edatime_handoff_bundle.zip', exportCleaningBundle],
    ];
    for (const [label, filename, run] of exports) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost btn-sm';
        button.textContent = label;
        button.addEventListener('click', async () => {
            const plan = getPlan();
            if (!plan) { status.textContent = 'Load a dataset before exporting.'; return; }
            const buttons = actions.querySelectorAll('button');
            buttons.forEach((control) => { control.disabled = true; });
            status.textContent = `Exporting pipeline revision ${plan.planRevision}…`;
            try {
                const blob = await run(plan);
                downloadBlob(blob, filename);
                status.textContent = `Downloaded ${filename} · pipeline revision ${plan.planRevision}.`;
            } catch (error) {
                status.textContent = error instanceof Error ? error.message : 'Export failed. Try again.';
            } finally {
                buttons.forEach((control) => { control.disabled = false; });
            }
        });
        actions.append(button);
    }
    root.append(actions, status);
    return root;
}
