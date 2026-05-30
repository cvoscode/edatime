# frontend/src/pages/shared/analysisPageRuntime.ts
> Shared runtime factory for analytics pages — consolidates `createEmptyStateController` + `bindExportButtons` + `createPageLifecycle` wiring.

## Interface: ExportConfig
```typescript
interface ExportConfig {
    key: string;
    png: { fn: (...args: string[]) => void; filename: string };
    svg: { fn: (...args: string[]) => void; filename: string };
    html: { fn: (...args: string[]) => void; filename: string };
    csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean };
}
```

## Interface: AnalysisPageRuntimeOptions
- `page: string`
- `emptyStateRootId: string`
- `exportConfig?: ExportConfig`
- `init?: () => void | (() => void)`
- `onVisible?: () => void`
- `onEveryPageChange?: () => void`

## Function: createAnalysisPageRuntime
- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions)`
  - Returns `{ mount(), updateEmptyState(opts) }`.
  - `mount()` calls `createPageLifecycle` with init (binds export buttons) and `onVisible`.
  - `updateEmptyState(opts)` delegates to lazy-initialized `createEmptyStateController`.

---
[1]: ../../../app/pageLifecycle.md#createPageLifecycle
[2]: ../../../ui/emptyState.md
[3]: ../../../utils/bindExportButtons.md
