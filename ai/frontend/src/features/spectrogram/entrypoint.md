# features/spectrogram/entrypoint.ts
> Normalized entrypoint for spectrogram page — uses getter-based deps injection. Lazy-loads `initSpectrogramPage` via dynamic import.

## Interface: SpectrogramEntrypointDeps
```typescript
interface SpectrogramEntrypointDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}
```

## Function: createSpectrogramEntrypoint
- `createSpectrogramEntrypoint(deps: SpectrogramEntrypointDeps): { init: () => Promise<void> }` [deps: [initSpectrogramPage][1]]
  - `init()` — dynamically imports `'../../pages/spectrogramPage.js'`, then `initSpectrogramPage(deps)`.

---
[1]: ../../pages/spectrogramPage.md
