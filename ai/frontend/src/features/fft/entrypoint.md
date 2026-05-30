# frontend/src/features/fft/entrypoint.ts
> FFT feature page entrypoint.

## Function: createFftEntrypoint
- `createFftEntrypoint(deps: { getRenderTimeseries: () => () => void }): { init: () => Promise<void> }`
  - Creates FFT page entrypoint with timeseries render callback.
  - `init()` — registers page lifecycle, sets up FFT chart and controls.