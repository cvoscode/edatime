# session.ts

Session save/restore for serializing analysis state to JSON with localStorage auto-save and file export/import.

## Interfaces

```typescript
interface SessionSnapshot {
    version: 1;
    timestamp: number;
    page: string;
    selectedCols: string[];
    seriesColors: Record<string, string>;
    columnRanges: Record<string, { from: number; to: number }>;
    adaptiveLineFilters: Array<{
        column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean;
    }>;
    currentStart: number | null;
    currentEnd: number | null;
    selectedColorColumn: string | null;
    chartText: { title: string; xLabel: string; yLabel: string };
    rollingEnabled: boolean;
    rollingWindow: number;
    anomalyEnabled: boolean;
    anomalyMethod: string;
    anomalyThreshold: number;
    scatterX: string;
    scatterY: string;
    scatterColorColumn: string;
    scatterRenderMode: string;
    theme: string;
    datasetRevision?: number;
}
```

```typescript
interface ApplySessionOptions {
    navigate?: boolean;
    preferHashPage?: boolean;
    metadataTimeRange?: { min: number; max: number } | null;
    currentDatasetRevision?: number;
    announceAdjustments?: boolean;
}
```

```typescript
interface ApplySessionResult {
    revisionMismatch: boolean;
    rangeAdjusted: boolean;
    usedMetadataRange: boolean;
    droppedFilterCount: number;
    navigatedToPage: boolean;
}
```

## Functions

```typescript
function captureSession(): SessionSnapshot
```

Capture the current analysis state as a serializable snapshot.

```typescript
function applySession(snap: SessionSnapshot, options?: ApplySessionOptions): ApplySessionResult
```

Restore appState from a snapshot.

```typescript
function autoSaveSession(): void
```

Auto-save session to localStorage.

```typescript
function autoRestoreSession(): SessionSnapshot | null
```

Auto-restore session from localStorage.

```typescript
function clearSavedSession(): void
```

Clear saved session from localStorage.

```typescript
function exportSessionToFile(): void
```

Export session to JSON file.

```typescript
function importSessionFromFile(): void
```

Import session from JSON file.

```typescript
function initAutoSave(): void
```

Initialize auto-save on navigation and filter changes.