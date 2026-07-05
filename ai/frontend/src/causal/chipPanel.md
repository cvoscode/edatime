# causal/chipPanel.md
> Column chip rendering for the causal page. Uses `renderSeriesChipList`; numeric columns remain selectable, nonnumeric columns are rendered as note chips.

## Functions

### renderColumnChips
- `renderColumnChips(deps: CausalDeps, columnsBar: HTMLElement, openEditPanel: (target: { kind: 'node'; col: string }) => void): void`
  - Renders the numeric select-all toggle and per-column chips with color pickers and edit-menu triggers. Empty-state sync counts selected numeric columns only.

---
[1]: ../ui/index.md#renderSeriesChipList
[2]: ./statusView.md#syncCausalEmptyState
[3]: ./selectionState.md
