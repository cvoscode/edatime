# causalPage.ts

Causal analysis page with interactive graph visualization, node/edge editing, and export functionality.

## Interfaces

```typescript
interface MetadataColumn {
    name: string;
    dtype?: string;
}

interface CausalMetadata {
    numeric_columns: string[];
    columns?: MetadataColumn[];
}

interface CausalDeps {
    getMetadata: () => CausalMetadata | null;
    chipColor: (col: string, idx: number) => string;
    numericColumns: () => string[];
    setLoading: (btnId: string, overlayId: string, loading: boolean, label?: string) => void;
}

type NodeAttributes = Record<string, unknown>
type PairAttributes = Record<string, unknown>
type EditTarget = { kind: 'node'; col: string } | { kind: 'edge'; key: string }

interface EdgeDraftAttribute {
    draftId: string;
    key: string;
    value: string;
}

interface EdgeDraftConnection extends CausalLink {
    draftId: string;
}

interface EdgeEditDraft {
    key: string;
    nodeA: string;
    nodeB: string;
    attrs: EdgeDraftAttribute[];
    connections: EdgeDraftConnection[];
}

interface PairEdgeGroup {
    key: string;
    nodeA: string;
    nodeB: string;
    connections: CausalLink[];
    lags: number[];
    meanValue: number;
    minPValue: number;
    hasUndirected: boolean;
    hasAmbiguous: boolean;
    direction: 'a_to_b' | 'b_to_a' | 'mixed';
}

interface NodePosition {
    x: number;
    y: number;
}
```

## Functions

```typescript
function setProgress(pct: number, label?: string): void
function hideProgress(): void
function metadataColumns(meta: CausalMetadata | null): MetadataColumn[]
function numericSet(meta: CausalMetadata | null): Set<string>
function isNumericColumn(col: string, meta: CausalMetadata | null): boolean
function defaultChipColor(col: string, idx: number, numeric: boolean, deps: CausalDeps): string
function ensureNodeMetadata(col: string, meta: CausalMetadata | null, deps: CausalDeps): void
function setStatus(text: string): void
function syncCausalEmptyState(): void
function nextDraftId(prefix: string): string
function pairOrder(a: string, b: string): [string, string]
function pairKey(a: string, b: string): string
function listPairGroups(): PairEdgeGroup[]
function buildPairGroupFromConnections(key: string, nodeA: string, nodeB: string, connections: CausalLink[]): PairEdgeGroup
function getPairGroup(key: string): PairEdgeGroup | null
function resolveLinkDirection(link: CausalLink): { source: string; target: string }
function collectSelfLoops(): Map<string, number>
function formatLagSummary(group: PairEdgeGroup): string
function edgeSummaryType(group: PairEdgeGroup): string
function edgeDirectionTitle(group: PairEdgeGroup): string
function edgeDirectionGlyph(group: PairEdgeGroup): string
function compactLagSummary(group: PairEdgeGroup): string
function edgeLabelText(group: PairEdgeGroup, compact: boolean): string
function edgeSymbols(group: PairEdgeGroup): [string, string]
function edgeMetricTip(kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue'): string
function edgeDirectionCode(group: PairEdgeGroup): number
function captureRenderedNodePositions(): void
function cleanupPositions(): void
function seedNodePositions(): void
function controlDecorators(control: HTMLElement | null): HTMLElement[]
function setControlEnabled(control: HTMLInputElement | HTMLSelectElement | null, enabled: boolean, title: string): void
function applyMethodControlState(method: string): void
function initInfoIcons(): void
function hidePopover(): void
function renderColumnChips(deps: CausalDeps, columnsBar: HTMLElement): void
function initChart(): Promise<void>
function scheduleCausalChartRefresh(attempts?: number): void
function isCausalChartReadyForInit(): boolean
function attachChartEvents(): void
function showCtxMenu(x: number, y: number, target: EditTarget): void
function attrsToJson(value: Record<string, unknown> | undefined): string
function stringifyDraftValue(value: unknown): string
function parseLooseValue(raw: string): unknown
function draftGroup(): PairEdgeGroup | null
function edgeTypeOptions(): string[]
function syncEdgeDraftFromDom(): void
function bindEdgeDraftControls(): void
function renderEdgeDraftEditor(): void
function openEditPanel(target: EditTarget): void
function parseAttrsJson(raw: string, kind: string): Record<string, unknown> | null
function replacePairConnections(oldKey: string, nextConnections: CausalLink[]): void
function applyEditPanel(): void
function closeEditPanel(): void
function deleteTarget(target: EditTarget): void
function buildLegendGraphic(): any[]
function buildPairEdge(group: PairEdgeGroup): any
function nodeTooltip(col: string, selfLoops: Map<string, number>): string
function edgeTooltip(group: PairEdgeGroup): string
function renderEChartsGraph(): void
function aggregateExportEdges(): Array<Record<string, unknown>>
function handleExport(fmt: string): void
function exportJSON(): string
function exportGLM(): string
function exportTorchGeometric(): string
function escH(value: string): string
function initCausalPage(deps: CausalDeps): void
```
