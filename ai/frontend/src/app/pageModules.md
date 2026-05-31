# frontend/src/app/pageModules.ts
> Lazy-loads and registers all analysis page entrypoints (fft, heatmap, scatter, spectrogram, causal, drift).

## Functions

### loadEntrypoints
- `loadEntrypoints(deps: { getRenderTimeseries: () => void; showPage: (name: string) => void; initScatterPage: (metadata: DatasetMetadata) => Promise<void>; getMetadata: () => DatasetMetadata | null; chipColor: (col: string, idx: number) => string; numericColumns: () => string[]; setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void; initDriftPage: (metadata: unknown) => void }): Promise<void>`
  - Dynamically imports all feature entrypoints and registers them via `pageRegistry.register()`. Each page has `requiresMetadata: true`.

---
[1]: ./pageRegistry.md
[2]: ../features/fft/entrypoint.md
[3]: ../features/heatmap/entrypoint.md
[4]: ../features/scatter/entrypoint.md
[5]: ../features/spectrogram/entrypoint.md
[6]: ../features/causal/entrypoint.md
[7]: ../features/drift/entrypoint.md
