/**
 * Data mutation feature entrypoint.
 * Owns transport-layer calls for transform and outlier removal.
 * UI layer (ui/*) only binds DOM to injected action interfaces.
 */

import { appState } from '../../store/appStateCompat.js';
import { postTransform, postRemoveOutliers } from '../../services/api/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RemoveOutliersInput {
    columns: string[] | null;
    method: string;
    threshold: number;
    window?: number;
}

export interface DataMutationActions {
    runTransform: (expression: string, outputName: string) => Promise<void>;
    removeOutliers: (input: RemoveOutliersInput) => Promise<{ rows_removed: number; rows_before: number; rows_after: number }>;
}

export type DataMutationFeature = DataMutationActions;

// ── Transport calls ───────────────────────────────────────────────────────────

async function runTransform(expression: string, outputName: string): Promise<void> {
    await postTransform(expression, outputName);
}

async function removeOutliers(input: RemoveOutliersInput): Promise<{ rows_removed: number; rows_before: number; rows_after: number }> {
    return postRemoveOutliers(
        input.columns,
        input.method,
        input.threshold,
        input.window,
    );
}

// ── Entrypoint factory ────────────────────────────────────────────────────────

export function createDataMutationFeature(): DataMutationFeature {
    return {
        runTransform,
        removeOutliers,
    };
}