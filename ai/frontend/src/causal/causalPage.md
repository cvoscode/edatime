# causal/causalPage.md
> Orchestrates the causal page by wiring selection state, chart rendering, edit flows, status UI, exports, and compute requests together.

## Re-exports
- `type CausalDeps`
- `type MetadataColumn`
- `type CausalMetadata`

## State
- `_chartEl: HTMLDivElement | null`
- `_activePopover: HTMLElement | null`

## Constants
- `METHOD_PC_STAGE: Set<string>` - Method names that expose PC-stage tuning controls.

## Functions
- `initInfoIcons(): void`
  - Binds hover and focus popovers for `.causal-info-icon` elements.
- `hidePopover(): void`
  - Removes the active causal tooltip popover.
- `controlDecorators(control: HTMLElement | null): HTMLElement[]`
  - Returns the control plus adjacent decorator elements that share disabled styling.
- `setControlEnabled(control: HTMLInputElement | HTMLSelectElement | null, enabled: boolean, title: string): void`
  - Toggles control disabled state and mirrored decorator accessibility styling.
- `applyMethodControlState(method: string): void`
  - Enables PC-only controls when the selected method uses a PC stage.
- `escH(value: string): string`
  - HTML-escapes a string value.
- `edgeDirectionCode(group: { direction: string; hasUndirected: boolean; hasAmbiguous: boolean }): number`
  - Converts aggregated pair-edge directionality into the Torch Geometric export code.
- `aggregateExportEdges(): Array<Record<string, unknown>>` [deps: [selectionState][1]]
  - Aggregates raw causal links into one export record per node pair.
- `handleExport(fmt: string): void` [deps: [statusView][4]]
  - Serializes the current graph to the requested format and triggers a download.
- `exportJSON(): string` [deps: [selectionState][1]]
  - Exports the current graph as aggregated JSON with node metadata and raw links.
- `exportGLM(): string` [deps: [selectionState][1]]
  - Exports directed links as GLM-style formulas plus uncertain-pair comments.
- `exportTorchGeometric(): string` [deps: [selectionState][1]]
  - Exports aggregated nodes and pair edges in a Torch Geometric-friendly JSON shape.
- `initCausalPage(deps: any): void` [deps: [api][2], [comparison][3], [selectionState][1], [chipPanel][5], [graphView][6], [statusView][4], [editPanel][7]]
  - Binds causal-page DOM events, runs causal graph computations, and keeps the view in sync with shared state.

---
[1]: ./selectionState.md
[2]: ../services/api/analytics.md
[3]: ./causalComparison.md
[4]: ./statusView.md
[5]: ./chipPanel.md
[6]: ./graphView.md
[7]: ./editPanel.md
