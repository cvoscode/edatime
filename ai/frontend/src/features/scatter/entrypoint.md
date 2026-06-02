# ai/frontend/src/features/scatter/entrypoint.md
> Normalized entrypoint for scatter analytics page — uses getter-based deps injection.

## Interface: ScatterEntrypointDeps
```ts
interface ScatterEntrypointDeps {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    getMetadata: () => DatasetMetadata;
}
```

## Function: createScatterEntrypoint
- `createScatterEntrypoint(deps: ScatterEntrypointDeps): { init: () => Promise<void> }` [deps: [initScatterPage][1]]
  - `init()` — calls `deps.initScatterPage(deps.getMetadata())` (async).

---
[1]: ../../scatter/scatterPage.md#initScatterPage
