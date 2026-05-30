# frontend/src/features/spectrogram/entrypoint.ts
> Spectrogram feature page entrypoint.

## Function: createSpectrogramEntrypoint
- `createSpectrogramEntrypoint(deps: { showPage: (page: string) => void }): { init: () => Promise<void> }`
  - Creates spectrogram page entrypoint.
  - `init()` — registers page lifecycle, sets up spectrogram chart and controls.