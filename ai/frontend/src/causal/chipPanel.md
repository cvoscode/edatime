# causal/chipPanel.md
> Column chip rendering for the causal page. Uses renderSeriesChipList; does not own chart state.

## Functions

### renderColumnChips
- `renderColumnChips(deps: CausalDeps, columnsBar: HTMLElement, openEditPanel: (target: { kind: 'node'; col: string }) => void): void`
  - Renders select-all toggle and per-column chips with color pickers and edit-menu triggers.

---
[1]: ../ui/index.md#renderSeriesChipList
[2]: ./statusView.md#syncCausalEmptyState
[3]: ./selectionState.md