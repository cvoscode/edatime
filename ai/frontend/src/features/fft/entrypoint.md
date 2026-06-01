# fft/entrypoint.ts
> Normalized entrypoint for FFT analysis page — uses getter-based deps injection.

## Interface: FftEntrypointDeps
```typescript
interface FftEntrypointDeps {
    getRenderTimeseries: () => void;
}
```

## Function: createFftEntrypoint
- `createFftEntrypoint(deps: FftEntrypointDeps): { init: () => void }`
  - `init()` — calls `initFftPage({ renderTimeseries: deps.getRenderTimeseries })`.

---
[1]: ../../pages/fftPage.md
