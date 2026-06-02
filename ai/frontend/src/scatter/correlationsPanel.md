# ai/frontend/src/scatter/correlationsPanel.md
> Scatter suggestion and correlation panel owner for sidebar suggestion rendering, correlation refresh, and causal handoff.

## Functions
- `renderSuggestions(suggestions: Array<{ column: string; pearson?: number | null; spearman?: number | null }>): void`
  - Renders the scatter sidebar suggestion buttons and active pair label.
- `refreshCorrelationsAndSuggestions(): Promise<void>` [deps: [fetchScatterCorrelations][1]]
  - Refreshes scatter correlation metadata, select options, and suggestion UI.
- `openScatterPairInCausal(): void`
  - Dispatches the causal preselect event and navigates to the causal page.

---
[1]: ../services/api/scatter.md#fetchScatterCorrelations
