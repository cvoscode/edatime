# ai/frontend/src/pages/shared/analysisPageRuntime.md
> Provides the shared analysis-page shell owner for lifecycle registration, lazy empty-state control, deferred export binding, and optional status text updates.

## Interface: ExportConfig
- `key: string`
- `png: { fn: (...args: string[]) => void; filename: string }`
- `svg: { fn: (...args: string[]) => void; filename: string }`
- `html: { fn: (...args: string[]) => void; filename: string }`
- `csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean }`

## Interface: AnalysisPageRuntimeOptions
- `page: string`
- `emptyStateRootId: string`
- `statusElId?: string`
- `exportConfig?: ExportConfig`
- `bindExportsOnInit?: boolean`
- `init?: () => void | (() => void)`
- `onVisible?: () => void`
- `onEveryPageChange?: () => void`

## Functions
- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions): { mount(): () => void; updateEmptyState(model: EmptyStateViewModel): void; updateStatus(text: string): void; bindExports(): void }` [deps: [createPageLifecycle][1], [createEmptyStateController][2], [bindExportButtons][3]]
  - Creates a shared analysis-page runtime with lazy empty-state creation, optional status writes, and one-time export binding.

---
[1]: ../../../app/pageLifecycle.md#createPageLifecycle
[2]: ../../../ui/emptyState.md#createEmptyStateController
[3]: ../../../utils/bindExportButtons.md#bindExportButtons
