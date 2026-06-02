# ai/frontend/src/pages/shared/analysisPageRuntime.md
> Provides the shared analysis-page shell owner by composing the generic page runtime with one-time export binding.

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
- `loadingElId?: string`
- `exportConfig?: ExportConfig`
- `bindExportsOnInit?: boolean`
- `init?: () => void | (() => void)`
- `onVisible?: () => void`
- `onEveryPageChange?: () => void`

## Functions
- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions): { mount(): () => void; updateEmptyState(model: EmptyStateViewModel): void; updateStatus(text: string): void; setLoading(loading: boolean): void; bindExports(): void }` [deps: [createPageRuntime][1], [bindExportButtons][2]]
  - Creates an analysis-page runtime that delegates lifecycle/status/loading/empty-state behavior to the generic page runtime and adds idempotent export binding.

---
[1]: ./pageRuntime.md#createPageRuntime
[2]: ../../../utils/bindExportButtons.md#bindExportButtons
