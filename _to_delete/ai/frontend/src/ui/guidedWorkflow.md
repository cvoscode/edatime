# frontend/src/ui/guidedWorkflow.ts
> Guided workflow panel with step tracking and contextual suggestions that treats `correlations` as the canonical public page.

## Types
- `WorkflowStepId`: `'upload' | 'timeseries' | 'correlations' | 'scatter' | 'causal'`

## Interfaces
- `WorkflowSnapshot`: `{ currentPage, hasDataset, selectedSeriesCount, visitedPages, scatterX, scatterY, causalLinkCount }`
- `WorkflowStepState`: `{ id, label, page, status: 'done'|'current'|'next'|'pending' }`
- `WorkflowProgress`: `{ steps, completedStepIds, activeStepId, nextStepId }`
- `WorkflowSuggestion`: `{ title, body, actionLabel, actionPage, hint? }`

## Functions
- `computeWorkflowProgress(snapshot: WorkflowSnapshot): WorkflowProgress`
  - Builds workflow progress from application snapshot, including the `correlations` step.
- `buildWorkflowSuggestion(snapshot: WorkflowSnapshot): WorkflowSuggestion`
  - Builds contextual guided recommendation and suppresses prompts on FFT, spectrogram, drift, and settings pages once the core workflow is underway.
- `renderGuidedWorkflow(): void`
  - Renders the workflow panel to DOM.
- `initGuidedWorkflow(): void`
  - Initializes guided workflow with event bindings.
- `enableGuidedWorkflow(): void`
- `disableGuidedWorkflow(): void`
- `goToNextGuidedStep(): void`
