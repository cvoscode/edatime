# causal/statusView.md
> Progress overlay and empty state helpers. Does not own any chart state.

## Functions

### Progress
- `setProgress(percent: number, label?: string): void`
  - Shows `#causal-progress-overlay` and sets width of `#causal-progress-fill`.
- `hideProgress(): void`
  - Hides `#causal-progress-overlay`.

### Empty State
- `syncCausalEmptyState(columnsLength: number): void`
  - Shows/hides `#causal-empty-state` based on numeric column selection count; the empty state stays visible until at least two numeric columns are selected.
