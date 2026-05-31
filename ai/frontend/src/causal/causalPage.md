# causal/causalPage.md
> Orchestration layer — delegates chart lifecycle to graphView, edit UI to editPanel, column chips to chipPanel, status/progress to statusView, and shared state to selectionState.

## Re-exports (from selectionState)
- `CausalDeps`
- `MetadataColumn`
- `CausalMetadata`

## Module-level State
- `_chartEl: HTMLDivElement | null`
- `_activePopover: HTMLElement | null`

## Constants
- `METHOD_PC_STAGE: Set<string>` — PC-method stage names that need special handling

## Functions

### Lifecycle
- `initCausalPage(deps: CausalDeps): Promise<void>`
  - Fetches causal graph, renders chips, initialises chart, binds events.

### Chart Delegates
- `renderEChartsGraph(): void` [deps: [initChart][1]]
- `scheduleCausalChartRefresh(attempts?: number): void` [deps: [initChart][1]]

### Selection / Graph State
- `setCurrentColumns(v: string[]): void`
- `setCurrentLinks(v: CausalLink[]): void`
- `setCurrentTauMax(v: number): void`
- `setAddEdgeMode(v: boolean): void`
- `setAddEdgeFirst(v: string | null): void`

### Edit Panel Delegates
- `openEditPanel(target: EditTarget): void`
- `applyEditPanel(): void`
- `closeEditPanel(): void`
- `deleteTarget(target: EditTarget): void`
- `bindEditPanelEvents(): void`

### Chip Delegates
- `renderColumnChips(deps: CausalDeps, columnsBar: HTMLElement, openEditPanel: (target: { kind: 'node'; col: string }) => void): void`

### Status Delegates
- `setStatus(text: string): void`
- `setProgress(percent: number, label?: string): void`
- `hideProgress(): void`
- `syncCausalEmptyState(columnsLength: number): void`

### Selection Helpers
- `isNumericColumn(col: string, meta: CausalMetadata): boolean`
- `ensureNodeMetadata(col: string, meta: CausalMetadata, deps: CausalDeps): void`
- `listPairGroups(): PairEdgeGroup[]`

---
[1]: ./graphView.md#initChart
[2]: ./chipPanel.md#renderColumnChips
[3]: ./statusView.md
[4]: ./editPanel.md
[5]: ./selectionState.md
[6]: ../services/api/index.md#fetchCausalGraph
[7]: ./causalComparison.md#notifyCausalGraphUpdated
[8]: ./causalComparison.md#CausalLink
