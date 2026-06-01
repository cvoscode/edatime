# spectrogram/entrypoint.ts
> Normalized entrypoint for spectrogram page — uses getter-based deps injection.

## Interface: SpectrogramEntrypointDeps
```typescript
interface SpectrogramEntrypointDeps {
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}
```

## Function: createSpectrogramEntrypoint
- `createSpectrogramEntrypoint(deps: SpectrogramEntrypointDeps): { init: () => void }`
  - `init()` — calls `initSpectrogramPage(deps)` directly.

---
[1]: ../../pages/spectrogramPage.md
