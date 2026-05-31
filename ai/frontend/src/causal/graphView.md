# causal/graphView.md
> ECharts lifecycle, resize observer, and chart event binding. Owns `_eChart`, `_chartEl`, `_chartResizeObserver`, `_chartInitPromise`.

## Module-level State (exported)
- `_eChart: any`
- `_chartEl: HTMLDivElement | null`

## Module-level State (private)
- `_chartEventsBound: boolean`
- `_chartResizeObserver: ResizeObserver | null`
- `_chartInitPromise: Promise<void> | null`

## Functions

### Initialization
- `isCausalChartReadyForInit(): boolean`
- `initChart(): Promise<void>`
- `scheduleCausalChartRefresh(attempts?: number): void`
- `setChartEl(el: HTMLDivElement | null): void`

### Rendering
- `renderEChartsGraph(): void`

### Events
- `attachChartEvents(): void`

---
[1]: ./selectionState.md
[2]: ./statusView.md#setStatus
[3]: ./editPanel.md#openEditPanel
[4]: ./editPanel.md#EditTarget
[5]: ./causalComparison.md#CausalLink