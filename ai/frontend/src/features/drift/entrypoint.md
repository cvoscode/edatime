# frontend/src/features/drift/entrypoint.ts
> Drift feature page entrypoint.

## Function: createDriftEntrypoint
- `createDriftEntrypoint(deps: { showPage: (page: string) => void }): { init: () => Promise<void> }`
  - Creates drift analysis page entrypoint.
  - `init()` — registers page lifecycle, sets up drift chart and controls.