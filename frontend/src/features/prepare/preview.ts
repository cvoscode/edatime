import { applyCleaningPlan, previewCleaningPlan, type CleaningPreviewResponse } from '../../cleaning/api.js';
import type { CleaningPlan } from '../../cleaning/types.js';

export interface PreparationPreviewState {
    result: CleaningPreviewResponse | null;
    running: boolean;
    applying: boolean;
    canApply: boolean;
    message: string;
}

/** Approval belongs to one exact plan snapshot, including its dataset identity. */
export function createPreparationPreview(options: {
    getPlan: () => CleaningPlan | null;
    onChange: () => void;
    onApplied: () => void | Promise<void>;
}) {
    let key = JSON.stringify(options.getPlan());
    let result: CleaningPreviewResponse | null = null;
    let request: AbortController | null = null;
    let applying = false;
    let disposed = false;
    let message = '';

    function sync(): void {
        const next = JSON.stringify(options.getPlan());
        if (next === key) return;
        const hadPreview = !!result || !!request;
        key = next;
        request?.abort();
        request = null;
        result = null;
        message = hadPreview ? 'The plan changed. Preview again for current results.' : '';
    }

    function getState(): PreparationPreviewState {
        sync();
        const hasStages = options.getPlan()?.stages.some((stage) => stage.enabled && stage.executionClass !== 'annotation');
        return {
            result, running: !!request, applying, message,
            canApply: !!hasStages && !!result && !request && !applying && !disposed,
        };
    }

    async function preview(): Promise<void> {
        sync();
        const plan = options.getPlan();
        if (!plan || applying || request || disposed) return;
        const owner = new AbortController();
        const requestKey = key;
        request = owner;
        result = null;
        message = 'Calculating exact preview…';
        options.onChange();
        try {
            const response = await previewCleaningPlan(plan, { signal: owner.signal });
            sync();
            if (disposed || owner.signal.aborted || owner !== request || key !== requestKey) return;
            if (response.sourceVersion.id !== plan.sourceVersionId || response.datasetRevision !== plan.datasetRevision) {
                throw new Error('The dataset changed. Preview again for current results.');
            }
            result = response;
            message = `${response.rowsAfter.toLocaleString()} of ${response.rowsBefore.toLocaleString()} rows · ${response.columnsAfter} of ${response.columnsBefore} columns after the plan.`;
        } catch (error) {
            if (disposed || owner.signal.aborted || owner !== request) return;
            message = error instanceof Error ? error.message : 'Could not preview this plan.';
        } finally {
            if (!disposed && owner === request) {
                request = null;
                options.onChange();
            }
        }
    }

    async function materialize(): Promise<void> {
        if (!getState().canApply) return;
        const plan = options.getPlan()!;
        const requestKey = key;
        applying = true;
        message = 'Creating a prepared dataset…';
        options.onChange();
        try {
            const response = await applyCleaningPlan(plan);
            sync();
            if (key === requestKey) {
                result = null;
                message = `Created ${response.sourceVersion.id} from ${plan.sourceVersionId}.`;
            }
            // A completed materialization still needs to refresh the shared dataset
            // when the user has navigated away from Preparation in the meantime.
            await options.onApplied();
        } catch (error) {
            sync();
            if (key === requestKey) {
                result = null;
                message = error instanceof Error ? error.message : 'Could not create a prepared dataset.';
            }
        } finally {
            applying = false;
            if (!disposed) options.onChange();
        }
    }

    return {
        getState, preview, materialize,
        dispose() {
            disposed = true;
            request?.abort();
            request = null;
        },
    };
}

export type PreparationPreview = ReturnType<typeof createPreparationPreview>;
