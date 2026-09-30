# frontend/src/app/pageModules.md
> Lazy page descriptors for all analysis pages (fft, heatmap, scatter, spectrogram, causal, drift). Each descriptor is metadata-only at registration; the page module is dynamically imported on first navigation.

## Interface: PageDescriptorInitDeps
- `getRenderTimeseries: () => void`
- `showPage: (name: string) => void`
- `getMetadata: () => DatasetMetadata | null`
- `chipColor: (col: string, idx: number) => string`
- `numericColumns: () => string[]`
- `setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void`
- `initDriftPage: (metadata: unknown) => void`

## Interface: PageDescriptor
- `name: string`
- `requiresMetadata: boolean`
- `cssModules?: readonly StyleModuleName[]`
- `load(deps: PageDescriptorInitDeps): Promise<{ init: () => void | Promise<void> }>`

## Built-in Descriptors
- `'fft'`, `'heatmap'`, `'scatter'` (with `cssModules: ['scatter']`), `'spectrogram'`, `'causal'`, `'drift'` (with `cssModules: ['drift']`).
- All have `requiresMetadata: true`.
- Each `load` performs a dynamic import of the matching `features/<name>/entrypoint.js` and calls the entrypoint factory.

## Functions

### loadPageDescriptors
- `loadPageDescriptors(deps: PageDescriptorInitDeps): Promise<void>`
  - Registers every entry in `PAGE_DESCRIPTORS` via `register(name, { requiresMetadata, init })`. The `init` callback preloads any declared `cssModules` (via `ensureStyleModule` from [pageStyles][1]) before dynamically importing the descriptor's `load(deps)` and invoking the returned `init()`.

---
[1]: ../utils/pageStyles.md
[2]: ./pageRegistry.md#register
[3]: ../features/fft/entrypoint.md
[4]: ../features/heatmap/entrypoint.md
[5]: ../features/scatter/entrypoint.md
[6]: ../features/spectrogram/entrypoint.md
[7]: ../features/causal/entrypoint.md
[8]: ../features/drift/entrypoint.md
