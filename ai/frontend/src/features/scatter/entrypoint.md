# scatter/entrypoint.ts
> Normalized entrypoint for scatter analytics page — uses getter-based deps injection.

## Interface: ScatterEntrypointDeps
```typescript
interface ScatterEntrypointDeps {
    initScatterPage: (metadata: DatasetMetadata) => Promise<void>;
    getMetadata: () => DatasetMetadata;
}
```

## Function: createScatterEntrypoint
- `createScatterEntrypoint(deps: ScatterEntrypointDeps): { init: () => void }`
  - `init()` — calls `deps.initScatterPage(deps.getMetadata())`.

---
[1]: ../../scatter/scatterPage.md
