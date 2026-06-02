# ai/frontend/src/causal/causalPage.md
> Causal page orchestration: wires selection state, chart rendering, edit UI, column chips, status/progress, compute workflow, and exports.

## Re-exports (from selectionState.ts)
- `type CausalDeps`
- `type MetadataColumn`
- `type CausalMetadata`

## State
- `_chartEl: HTMLDivElement | null`
- `_activePopover: HTMLElement | null`

## Functions

### initInfoIcons
- `initInfoIcons(): void`
  - Binds hover/focus/blur popovers for `.causal-info-icon` elements.

### hidePopover
- `hidePopover(): void`
  - Removes the active causal tooltip popover from the DOM.

### initCausalPage
- `initCausalPage(deps: any): void` [deps: [chipPanel][1], [graphView][2], [statusView][3], [editPanel][4], [workflow][5], [export][6]]
  - Binds all causal page DOM elements (method/test/tau/alpha/maxConds/fdr selects, compute/export/add-edge buttons, columns bar).
  - Initialises chip panel, graph view, edit panel, and info icons.
  - Wires `edatime:causal-preselect` event to restore column selections on page change.
  - Handles PC-stage control visibility, edge-add mode toggle, Escape-cancel, export menu, and compute click with sync empty state.

---
[1]: ./chipPanel.md
[2]: ./graphView.md
[3]: ./statusView.md
[4]: ./editPanel.md
[5]: ./workflow.md
[6]: ./export.md