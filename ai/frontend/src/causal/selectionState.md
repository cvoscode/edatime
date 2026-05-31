# causal/selectionState.md
> Stateful helpers for causal page — owns column metadata derivation, pair-group computation, node position tracking, and live selection state. Does not own DOM.

## Types
- `MetadataColumn` — `{ name: string; dtype?: string }`
- `CausalMetadata` — `{ numeric_columns: string[]; columns?: MetadataColumn[] }`
- `CausalDeps` — `{ getMetadata: () => CausalMetadata | null; chipColor: (col: string, idx: number) => string; numericColumns: () => string[]; setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void }`
- `PairEdgeGroup` — `{ key: string; nodeA: string; nodeB: string; connections: CausalLink[]; lags: number[]; meanValue: number; minPValue: number; hasUndirected: boolean; hasAmbiguous: boolean; direction: 'a_to_b' | 'b_to_a' | 'mixed' }`
- `NodePosition` — `{ x: number; y: number }`
- `NodeAttributes` — `{ dtype?: string; numeric?: boolean }`
- `PairAttributes` — `Record<string, unknown>`
- `EditTarget` — `{ kind: 'node'; col: string } | { kind: 'edge'; key: string }`

## Module-level State (exported)
- `_currentColumns: string[]`
- `_currentLinks: CausalLink[]`
- `_currentTauMax: number`
- `_chipColors: Map<string, string>`
- `_nodeLabels: Map<string, string>`
- `_nodeAttrs: Map<string, NodeAttributes>`
- `_nodePositions: Map<string, NodePosition>`
- `_selectedColumns: Set<string>`
- `_addEdgeMode: boolean`
- `_addEdgeFirst: string | null`
- `_pairAttrs: Map<string, PairAttributes>`

## State Setters (exported)
- `setAddEdgeMode(v: boolean): void`
- `setAddEdgeFirst(v: string | null): void`
- `setCurrentColumns(v: string[]): void`
- `setCurrentLinks(v: CausalLink[]): void`
- `setCurrentTauMax(v: number): void`

## Pair Attr Helpers (exported)
- `clearPairAttrsKey(key: string): void`
- `setPairAttrsKey(key: string, attrs: PairAttributes): void`
- `deletePairAttrsKeys(pred: (key: string) => boolean): void`

## Selection Helpers (exported)
- `resetSelectionState(): void`
- `isNumericColumn(col: string, meta: CausalMetadata): boolean`
- `ensureNodeMetadata(col: string, meta: CausalMetadata, deps: CausalDeps): void`
- `metadataColumns(meta: CausalMetadata): MetadataColumn[]`
- `numericSet(meta: CausalMetadata): Set<string>`
- `buildPairGroupFromConnections(key: string, nodeA: string, nodeB: string, connections: CausalLink[]): PairEdgeGroup`
- `getPairGroup(key: string): PairEdgeGroup | undefined`
- `listPairGroups(): PairEdgeGroup[]`
- `pairKey(nodeA: string, nodeB: string): string`
- `resolveLinkDirection(link: CausalLink): 'a_to_b' | 'b_to_a' | 'mixed'`
- `captureRenderedNodePositions(): void`
- `seedNodePositions(columns: string[]): void`

---
[1]: ./causalComparison.md#CausalLink