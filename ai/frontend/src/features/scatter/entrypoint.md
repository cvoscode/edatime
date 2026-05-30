# frontend/src/features/scatter/entrypoint.ts
> Scatter feature page entrypoint.

## Function: createScatterEntrypoint
- `createScatterEntrypoint(deps: { showPage: (page: string) => void }): { init: () => Promise<void> }`
  - Creates scatter/density page entrypoint.
  - `init()` — registers page lifecycle, sets up scatter plot and controls.