# scatterPage.ts

Scatter plot page: main entry, controls binding, and orchestration.

## Variables

```typescript
let _gpuUnavailable: boolean | null
let scatterEmptyStateController: ReturnType<typeof createEmptyStateController> | null
let _scatterAbort: AbortController | null
let _scatterDebounceTimer: ReturnType<typeof setTimeout> | null
```

## Functions

```typescript
function getScatterEmptyStateController(): ReturnType<typeof createEmptyStateController>
function syncScatterEmptyState(message?: string): void
function syncScatterFilterBadge(): void
function isGPUAvailable(): Promise<boolean>
function setSidebarAnalyticsSelection(viewName: string): void
function syncScatterViewButtons(viewName: string): void
function setScatterView(viewName: string, options?: { render?: boolean }): Promise<void>
function refreshActiveScatterView(): Promise<void>
function renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void
function refreshCorrelationsAndSuggestions(): Promise<void>
function openScatterPairInCausal(): void
function renderScatterDebounced(): void
function renderScatter(): Promise<void>
function rerenderScatterFromCache(resetViewFlag?: boolean): Promise<void>
function onMatrixCellClick(x: string, y: string): Promise<void>
function bindControls(): void
function handleErr(err: unknown): void
function initScatterPage(metadata: DatasetMetadata): Promise<void>
```
