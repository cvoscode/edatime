# frontend/src/features/causal/entrypoint.ts
> Causal feature page entrypoint.

## Function: createCausalEntrypoint
- `createCausalEntrypoint(deps: { showPage: (page: string) => void }): { init: () => Promise<void> }`
  - Creates causal analysis page entrypoint.
  - `init()` — registers page lifecycle, sets up causal graph and controls.