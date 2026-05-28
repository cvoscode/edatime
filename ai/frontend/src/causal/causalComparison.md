# causalComparison.ts

Causal method comparison utilities for saving, loading, and comparing causal runs.

## Interfaces

```typescript
interface CausalLink {
    source: string;
    target: string;
    lag: number;
    type: string;
    value: number;
    pvalue: number;
}

interface SavedCausalRun {
    id: string;
    label: string;
    timestamp: number;
    method: string;
    test: string;
    tauMax: number;
    alpha: number;
    columns: string[];
    links: CausalLink[];
}

interface ChangedLink {
    key: string;
    a: CausalLink;
    b: CausalLink;
    changes: string[];
}
```

## Functions

```typescript
function generateId(): string
function loadSavedRuns(): SavedCausalRun[]
function persistRuns(): void
function saveRun(
    links: CausalLink[],
    columns: string[],
    params: { method: string; test: string; tauMax: number; alpha: number },
    label?: string,
): SavedCausalRun
function deleteRun(id: string): void
function clearAllRuns(): void
function edgeDiff(runA: SavedCausalRun, runB: SavedCausalRun): { added: CausalLink[]; removed: CausalLink[]; changed: ChangedLink[] }
function escHtml(s: string): string
function formatDiffMetric(value: number): string
function renderRunSelector(
    containerId: string,
    runs: SavedCausalRun[],
    selectedId: string | null,
    onSelect: (id: string) => void,
): void
function renderDiff(runA: SavedCausalRun, runB: SavedCausalRun): string
function refreshCompareUI(): void
function initCausalComparison(): void
function notifyCausalGraphUpdated(columns: string[], links: CausalLink[]): void
```
