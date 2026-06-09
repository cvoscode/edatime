# features/fft/entrypoint.ts
> Normalized entrypoint for FFT analysis page — uses getter-based deps injection. Lazy-loads `initFftPage` via dynamic import.

## Interface: FftEntrypointDeps
```typescript
interface FftEntrypointDeps {
    getRenderTimeseries: () => void;
}
```

## Function: createFftEntrypoint
- `createFftEntrypoint(deps: FftEntrypointDeps): { init: () => Promise<void> }` [deps: [initFftPage][1]]
  - `init()` — dynamically imports `'../../pages/fftPage.js'`, then `initFftPage({ renderTimeseries: deps.getRenderTimeseries })`.

---
[1]: ../../pages/fftPage.md
