# ai/frontend/src/causal/causalPage.md
> Entry point and page lifecycle for the causal analysis page. Delegates chart to `graphView.ts`, chips to `chipPanel.ts`, status to `statusView.ts`, and export to `export.ts`.

## Imports
- `appState` from [../store/index.js](../store/index.md)

## Functions
- `seedSelectedColumnsFromDataset(deps: any): void` [new in refactor]
  - Restores selected columns from `appState.selectedCols` if `_selectedColumns` is empty; filters to columns present in `deps.numericColumns()`. Called on init and on `edatime:column-select-change`.
- `initCausalPage(deps: any): void`
  - Bootstraps the causal page: finds DOM elements, seeds selected columns, renders column chips, sets up column-select change listener.

---
[1]: ../store/index.md
[2]: ./chipPanel.md
[3]: ./graphView.md
[4]: ./statusView.md
