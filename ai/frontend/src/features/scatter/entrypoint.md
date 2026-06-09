# features/scatter/entrypoint.ts
> Normalized entrypoint for scatter analytics page — uses getter-based deps injection. Lazy-loads the page implementation (`initScatterPage`) via dynamic import.

## Interface: ScatterEntrypointDeps
```ts
interface ScatterEntrypointDeps {
    getMetadata: () => DatasetMetadata;
}
```

## Function: createScatterEntrypoint
- `createScatterEntrypoint(deps: ScatterEntrypointDeps): { init: () => Promise<void> }` [deps: [initScatterPage][1]]
  - `init()` — dynamically imports `'../../scatter/scatterPage.js'`, captures `metadata = deps.getMetadata()`, then `await initScatterPage(metadata)`.

---
[1]: ../../scatter/scatterPage.md#initScatterPage
