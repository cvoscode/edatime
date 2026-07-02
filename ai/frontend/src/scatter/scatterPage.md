# ai/frontend/src/scatter/scatterPage.md
> Scatter page entrypoint: live plot fetch/render orchestration, per-view filter snapshots, and plot/matrix switching.

## Functions
- `handleErr(err: unknown): void`
  - Logs and surfaces scatter-page errors.
- `syncScatterFilterBadge`
  - Re-export from `runtime.ts`.
- `renderScatterDebounced(): void`
  - Schedules a plot rerender after the scatter debounce window.
- `renderScatter(): Promise<void>` [deps: [fetchScatterPoints][1]]
  - Fetches plot data for the current X/Y/color selection, updates scatter caches, and recreates or rerenders the active chart.
- `refreshActiveScatterView(): Promise<void>`
  - Rerenders whichever scatter view is active.
- `setScatterView(viewName: string, options: { render?: boolean } = {}): Promise<void>`
  - Clears any pending scatter debounce, dismisses stale toasts, snapshots the leaving view's filters, restores the entering view's snapshot, and then renders plot or matrix mode.
- `refreshCorrelationsAndSuggestions`
  - Re-export from `correlationsPanel.ts`.
- `initScatterPage(metadata: DatasetMetadata): Promise<void>`
  - Records scatter metadata, populates controls, binds listeners once, and triggers the first correlation refresh plus plot render.
