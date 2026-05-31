# causal/statusView.md
> Status line and progress overlay helpers. Does not own any chart state.

## Functions

### Status
- `setStatus(text: string): void`
  - Sets text content of `#causal-status` element.

### Progress
- `setProgress(percent: number, label?: string): void`
  - Shows `#causal-progress-overlay` and sets width of `#causal-progress-fill`.
- `hideProgress(): void`
  - Hides `#causal-progress-overlay`.

### Empty State
- `syncCausalEmptyState(columnsLength: number): void`
  - Shows/hides `#causal-empty-state` based on column selection count.