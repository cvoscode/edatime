# ai/frontend/src/causal/causalPage.md
> Entry point and page lifecycle for the causal analysis page. Delegates chart to `graphView.ts`, chips to `chipPanel.ts`, status to `statusView.ts`, and export to `export.ts`.

## Imports
- `appState` from [../store/index.js](../store/index.md)

## Functions
- `seedSelectedColumnsFromDataset(deps: any): void` [new in refactor]
  - Restores selected columns from `appState.selectedCols` if `_selectedColumns` is empty; filters to columns present in `deps.numericColumns()`. Called on init and on `edatime:column-select-change`.
- `initCausalPage(deps: any): void` [deps: [initCausalHelp][1]]
  - Bootstraps the causal page: finds DOM elements, seeds selected columns, renders column chips, keeps the empty-state gate synchronized with numeric selection count, and wires the page-level `?` help button via `initCausalHelp`.

---
[1]: ../pages/causalHelp.md#initCausalHelp
[2]: ../store/index.md
[3]: ./chipPanel.md
[4]: ./graphView.md
[5]: ./statusView.md
