# ai/frontend/src/features/drift/entrypoint.md
> Normalized entrypoint for drift analysis page — uses getter-based deps injection.

## Interface: DriftEntrypointDeps
```ts
interface DriftEntrypointDeps {
    initDriftPage: (metadata: unknown) => Promise<void>;
    getMetadata: () => unknown;
}
```

## Function: createDriftEntrypoint
- `createDriftEntrypoint(deps: DriftEntrypointDeps): { init: () => Promise<void> }` [deps: [initDriftPage][1]]
  - `init()` — dynamic import of `driftPage.ts`, calls `initDriftPage(deps.getMetadata())`, sets `initialized` guard to prevent double init.

---
[1]: ../../drift/driftPage.md#initDriftPage
