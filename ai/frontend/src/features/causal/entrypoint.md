# causal/entrypoint.ts
> Normalized entrypoint for causal analysis page — uses getter-based deps injection.

## Interface: CausalEntrypointDeps
```typescript
interface CausalEntrypointDeps {
    getMetadata: () => import('../../types.js').DatasetMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}
```

## Function: createCausalEntrypoint
- `createCausalEntrypoint(deps: CausalEntrypointDeps): { init: () => Promise<void> }`
  - `init()` — dynamic import of `causalPage.ts` + calls `initCausalPage` with getter-wired deps.

---
[1]: ../../causal/causalPage.md
