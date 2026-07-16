/**
 * Pipeline proposal actions for the dataset-tools controls.
 * UI layer (ui/*) only binds DOM to injected action interfaces.
 */

import { proposeCleaningOutliers, type OutlierProposalResponse } from '../../cleaning/api.js';
import type { CleaningPlan } from '../../cleaning/types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OutlierProposalInput {
    columns: string[];
    method: 'zscore' | 'iqr';
    threshold: number;
}

export interface DataMutationActions {
    proposeOutliers: (plan: CleaningPlan, input: OutlierProposalInput) => Promise<OutlierProposalResponse>;
}

export type DataMutationFeature = DataMutationActions;

async function proposeOutliers(plan: CleaningPlan, input: OutlierProposalInput): Promise<OutlierProposalResponse> {
    return proposeCleaningOutliers(plan, {
        columns: input.columns,
        method: input.method,
        threshold: input.threshold,
    });
}

// ── Entrypoint factory ────────────────────────────────────────────────────────

export function createDataMutationFeature(): DataMutationFeature {
    return {
        proposeOutliers,
    };
}
