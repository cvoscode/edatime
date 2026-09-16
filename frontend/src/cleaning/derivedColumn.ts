import { validateCleaningPlan } from './api.js';
import { hashCleaningPlan } from './planHash.js';
import type { CleaningPlanStore } from './store.js';
import type { DerivedColumnStage, SourcePage } from './types.js';

/** Validate against the working schema before making a calculation live on every plot. */
export async function addDerivedColumn(
    store: Pick<CleaningPlanStore, 'getSnapshot' | 'addStage'>,
    expression: string,
    outputColumn: string,
    sourcePage: SourcePage = 'manual',
): Promise<void> {
    const plan = store.getSnapshot();
    if (!plan) throw new Error('Load a dataset before adding a calculated column.');
    if (!expression.trim() || !outputColumn.trim()) throw new Error('Enter an expression and an output column name.');
    const timestamp = new Date().toISOString();
    const stage: DerivedColumnStage = {
        id: `derived-${crypto.randomUUID()}`, createdAt: timestamp, updatedAt: timestamp,
        kind: 'derivedColumn', executionClass: 'polarsExpression', scope: 'schema', enabled: true,
        sourcePage, label: `Calculate ${outputColumn.trim()}`,
        expression: expression.trim(), outputColumn: outputColumn.trim(),
    };
    await validateCleaningPlan({ ...plan, stages: [...plan.stages, stage], planRevision: plan.planRevision + 1 });
    const current = store.getSnapshot();
    if (!current || hashCleaningPlan(current) !== hashCleaningPlan(plan)) {
        throw new Error('The dataset or pipeline changed. Check the expression and add it again.');
    }
    store.addStage(stage);
}
