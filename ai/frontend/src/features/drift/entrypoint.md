# drift/entrypoint.ts
> Normalized entrypoint for drift analysis page — uses getter-based deps injection.

## Interface: DriftEntrypointDeps
```typescript
interface DriftEntrypointDeps {
    initDriftPage: (metadata: unknown) => void;
    getMetadata: () => unknown;
}
```

## Function: createDriftEntrypoint
- `createDriftEntrypoint(deps: DriftEntrypointDeps): { init: () => Promise<void> }`
  - `init()` — dynamic import of `driftPage.ts` + calls `initDriftPage` with `deps.getMetadata()`.

---
[1]: ../../drift/driftPage.md
