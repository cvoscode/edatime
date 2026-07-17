# frontend/src/platform/analysisRuntime.ts
> Analysis-page runtime built on `createPageRuntime`; adds declarative export-button binding.

## Interfaces
- `ExportConfig`
  - `key: string`
  - `png: { fn: (...args: string[]) => void; filename: string }`
  - `svg: { fn: (...args: string[]) => void; filename: string }`
  - `html: { fn: (...args: string[]) => void; filename: string }`
  - `csv?: { fn: (filename: string) => void; filename: string; dataCheck?: () => boolean }`
- `AnalysisPageRuntimeOptions` — extends `PageRuntimeOptions` semantics with:
  - `exportConfig?: ExportConfig`
  - `bindExportsOnInit?: boolean = true`
  - plus `init?`, `onVisible?`, `onEveryPageChange?` (forwarded to the base runtime).

## Functions
- `createAnalysisPageRuntime(options: AnalysisPageRuntimeOptions)`
  - Returns `{ mount, activate, updateEmptyState, updateStatus, setLoading, bindExports }`.
  - `bindExports()` is idempotent — only the first call binds. [deps: [pageRuntime][1], [utils/bindExportButtons][2]]

---
[1]: ./pageRuntime.md
[2]: ../utils/bindExportButtons.md