# ai/frontend/src/causal/causalPage.md
> Causal graph computation, node/edge editing, and ECharts-based graph visualisation.

## Types
- `CausalMetadata` — `{ numeric_columns: string[]; columns?: MetadataColumn[] }`
- `CausalDeps` — `{ getMetadata: () => CausalMetadata | null; chipColor: (col: string, idx: number) => string; numericColumns: () => string[]; setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void }`
- `EdgeDraftConnection` extends `CausalLink` — adds `draftId: string`
- `EdgeEditDraft` — `{ key: string; nodeA: string; nodeB: string; attrs: EdgeDraftAttribute[]; connections: EdgeDraftConnection[] }`
- `PairEdgeGroup` — `{ key: string; nodeA: string; nodeB: string; connections: CausalLink[]; lags: number[]; meanValue: number; minPValue: number; hasUndirected: boolean; hasAmbiguous: boolean; direction: 'a_to_b' | 'b_to_a' | 'mixed' }`

## Functions
- `initCausalPage(deps: CausalDeps): Promise<void>` — Initialises the causal page with a metadata getter, chip colour helper, and loading state setter.

## Module-level State
- `_eChart` — ECharts instance
- `_chartEl` — chart DOM element
- `_currentColumns: string[]`
- `_currentLinks: CausalLink[]`
- `_currentTauMax: number`
- `_nodeLabels: Map<string, string>`
- `_chipColors: Map<string, string>`
- `_nodeAttrs: Map<string, NodeAttributes>`
- `_nodePositions: Map<string, NodePosition>`
- `_selectedColumns: Set<string>`
- `_editTarget: EditTarget | null`
- `_addEdgeMode: boolean`
- `_addEdgeFirst: string | null`
- `_edgeEditDraft: EdgeEditDraft | null`

---
[1]: ../services/api/index.md#fetchCausalGraph
[2]: ./causalComparison.md#CausalLink
[3]: ../ui/composites/SeriesChip.md#SeriesChip
[4]: ../ui/index.md#renderSeriesChipList
