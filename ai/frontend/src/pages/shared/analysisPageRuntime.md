# ai/frontend/src/pages/shared/analysisPageRuntime.md
> Shared runtime factory for analytics pages — consolidates empty-state management, export bindings, and page lifecycle wiring.

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
- `page: string` — page name passed to createPageLifecycle
- `emptyStateRootId: string` — DOM id of the empty-state root element
- `exportConfig?: ExportConfig` — export button bindings
- `init?: () => void | (() => void)` — called once on page mount
- `onVisible?: () => void` — called when page becomes visible
- `onEveryPageChange?: () => void` — called on every page change

## Function: createAnalysisPageRuntime
- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions): { mount(): void; updateEmptyState(model: EmptyStateViewModel): void }` [deps: [createPageLifecycle][1], [createEmptyStateController][2], [bindExportButtons][3]]
  - Returns page runtime with lazy empty-state controller and lifecycle hooks.

---
[1]: ../../../app/pageLifecycle.md#createPageLifecycle
[2]: ../../../ui/emptyState.md#createEmptyStateController
[3]: ../../../utils/bindExportButtons.md#bindExportButtons
