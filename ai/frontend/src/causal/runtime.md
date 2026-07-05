# frontend/src/causal/runtime.ts
> Analysis-page runtime wrapper for the causal page. Keeps the empty-state visibility synchronized with the selected numeric column count on init and on every page change.

## Functions
- `initCausalPageRuntime(): void`
  - Creates the causal `createAnalysisPageRuntime` wrapper and binds the runtime bootstrap immediately.
