import { applyCleaningPlan, exportCleaningPlan, listDatasetVersions, previewCleaningPlan, selectDatasetVersion } from './api.js';
import type { CleaningPlanStore } from './store.js';
import { downloadBlob } from '../utils/dom.js';

type PlanPanelStore = Pick<CleaningPlanStore,
    'getSnapshot' | 'subscribe' | 'addStage' | 'updateStage' | 'removeStage' | 'setStageEnabled'>;

export interface CleaningPlanPanelDeps {
    planStore: PlanPanelStore;
    getViewport: () => { xMin: number | null; xMax: number | null } | null;
    onPlanChanged?: () => void;
    onPlanApplied?: () => Promise<void> | void;
}

function button(label: string, className = 'btn btn-ghost btn-sm'): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    return element;
}

function stageSummary(stage: NonNullable<ReturnType<PlanPanelStore['getSnapshot']>>['stages'][number]): string {
    switch (stage.kind) {
        case 'timeRange': return `${stage.mode === 'keepInside' ? 'Keep' : 'Drop'} ${new Date(stage.startMs).toISOString()} – ${new Date(stage.endMs).toISOString()}`;
        case 'columnRange': return `${stage.mode === 'keepInside' ? 'Keep' : 'Drop'} ${stage.column}: ${stage.from} – ${stage.to}`;
        case 'adaptiveLine': return `${stage.keepAbove ? 'Keep above' : 'Keep below'} line for ${stage.column}`;
        case 'annotation': return stage.label;
    }
}

/**
 * Compact, page-independent control surface for the active accumulated plan.
 * It intentionally exposes only reversible operations: preview, JSON export,
 * stage enable/remove, and an explicit "use visible time range" authoring
 * action. Data materialization remains a deliberate server-side action.
 */
export function mountCleaningPlanPanel(deps: CleaningPlanPanelDeps): () => void {
    const trigger = document.getElementById('open-cleaning-plan-btn') as HTMLButtonElement | null;
    if (!trigger) return () => {};

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop cleaning-plan-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
        <section class="modal cleaning-plan-modal" role="dialog" aria-modal="true" aria-labelledby="cleaning-plan-title">
          <header class="modal-header"><span class="modal-title" id="cleaning-plan-title">Cleaning plan</span></header>
          <div class="modal-body">
            <p class="cleaning-plan-status" data-plan-status></p>
            <div class="cleaning-plan-stages" data-plan-stages></div>
            <p class="cleaning-plan-preview" data-plan-preview aria-live="polite"></p>
            <div class="cleaning-plan-actions" data-plan-actions></div>
          </div>
        </section>`;
    document.body.appendChild(backdrop);

    const status = backdrop.querySelector<HTMLElement>('[data-plan-status]')!;
    const stages = backdrop.querySelector<HTMLElement>('[data-plan-stages]')!;
    const preview = backdrop.querySelector<HTMLElement>('[data-plan-preview]')!;
    const actions = backdrop.querySelector<HTMLElement>('[data-plan-actions]')!;

    const notify = () => deps.onPlanChanged?.();
    const render = () => {
        const plan = deps.planStore.getSnapshot();
        stages.replaceChildren();
        actions.replaceChildren();
        preview.textContent = '';
        if (!plan) {
            status.textContent = 'Load a dataset to start an accumulated cleaning plan.';
            return;
        }
        status.textContent = `${plan.stages.filter((stage) => stage.enabled).length} active stage${plan.stages.filter((stage) => stage.enabled).length === 1 ? '' : 's'} · source ${plan.sourceVersionId}`;
        if (plan.stages.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No transforms yet. Filters created from plots accumulate here.';
            stages.appendChild(empty);
        } else {
            for (const stage of plan.stages) {
                const row = document.createElement('div');
                row.className = 'cleaning-plan-stage';
                const description = document.createElement('span');
                description.textContent = stageSummary(stage);
                if (!stage.enabled) description.classList.add('is-disabled');
                const toggle = button(stage.enabled ? 'Disable' : 'Enable');
                toggle.addEventListener('click', () => {
                    deps.planStore.setStageEnabled(stage.id, !stage.enabled);
                    notify();
                });
                const remove = button('Remove');
                remove.addEventListener('click', () => {
                    deps.planStore.removeStage(stage.id);
                    notify();
                });
                row.append(description, toggle, remove);
                stages.appendChild(row);
            }
        }

        const addViewport = button('Add visible time range');
        addViewport.addEventListener('click', () => {
            const viewport = deps.getViewport();
            const startMs = Number(viewport?.xMin);
            const endMs = Number(viewport?.xMax);
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs === endMs) {
                preview.textContent = 'Zoom or set a valid visible time range first.';
                return;
            }
            const existing = [...plan.stages].reverse().find((stage) => stage.kind === 'timeRange' && stage.sourcePage === 'timeseries');
            if (existing) {
                deps.planStore.updateStage(existing.id, {
                    startMs: Math.min(startMs, endMs), endMs: Math.max(startMs, endMs), enabled: true,
                } as never);
            } else {
                deps.planStore.addStage({
                    kind: 'timeRange', executionClass: 'polarsExpression', scope: 'row', enabled: true,
                    sourcePage: 'timeseries', label: 'Keep visible time range',
                    startMs: Math.min(startMs, endMs), endMs: Math.max(startMs, endMs), mode: 'keepInside',
                });
            }
            notify();
        });
        const previewButton = button('Preview');
        previewButton.addEventListener('click', async () => {
            preview.textContent = 'Calculating preview…';
            try {
                const result = await previewCleaningPlan(deps.planStore.getSnapshot()!);
                preview.textContent = `${result.rowsAfter.toLocaleString()} of ${result.rowsBefore.toLocaleString()} rows remain (${result.rowsRemoved.toLocaleString()} removed).`;
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not preview this plan.';
            }
        });
        const exportPlan = button('Export plan JSON');
        exportPlan.addEventListener('click', async () => {
            const current = deps.planStore.getSnapshot();
            if (!current) return;
            exportPlan.disabled = true;
            try {
                downloadBlob(await exportCleaningPlan(current), 'edatime_cleaning_plan.json');
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not export this plan.';
            } finally {
                exportPlan.disabled = false;
            }
        });
        const apply = button('Apply as new dataset', 'btn btn-primary btn-sm');
        apply.addEventListener('click', async () => {
            const current = deps.planStore.getSnapshot();
            if (!current) return;
            apply.disabled = true;
            preview.textContent = 'Materializing a new dataset version…';
            try {
                const result = await applyCleaningPlan(current);
                preview.textContent = `Created ${result.sourceVersion.id} from ${current.sourceVersionId}.`;
                await deps.onPlanApplied?.();
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not materialize this plan.';
            } finally {
                apply.disabled = false;
            }
        });
        const resetOriginal = button('Use original dataset');
        resetOriginal.addEventListener('click', async () => {
            resetOriginal.disabled = true;
            preview.textContent = 'Restoring the original source dataset…';
            try {
                const versions = await listDatasetVersions();
                const root = versions.find((version) => version.id === version.rootId);
                if (!root) throw new Error('The original source version is no longer available.');
                await selectDatasetVersion(root.id);
                preview.textContent = `Restored ${root.id}.`;
                await deps.onPlanApplied?.();
            } catch (error) {
                preview.textContent = error instanceof Error ? error.message : 'Could not restore the original dataset.';
            } finally {
                resetOriginal.disabled = false;
            }
        });
        const close = button('Done', 'btn btn-primary btn-sm');
        close.addEventListener('click', () => { backdrop.hidden = true; trigger.focus(); });
        actions.append(addViewport, previewButton, exportPlan, apply, resetOriginal, close);
    };

    const open = () => { render(); backdrop.hidden = false; };
    const closeOnBackdrop = (event: MouseEvent) => { if (event.target === backdrop) backdrop.hidden = true; };
    const closeOnEscape = (event: KeyboardEvent) => { if (!backdrop.hidden && event.key === 'Escape') backdrop.hidden = true; };
    trigger.addEventListener('click', open);
    backdrop.addEventListener('click', closeOnBackdrop);
    document.addEventListener('keydown', closeOnEscape);
    const unsubscribe = deps.planStore.subscribe(() => { if (!backdrop.hidden) render(); });
    return () => {
        trigger.removeEventListener('click', open);
        backdrop.removeEventListener('click', closeOnBackdrop);
        document.removeEventListener('keydown', closeOnEscape);
        unsubscribe();
        backdrop.remove();
    };
}
