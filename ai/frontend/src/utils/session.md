# ai/frontend/src/utils/session.md

> Session save/restore for analysis state: localStorage auto-save, manual JSON export/import, and `SessionSnapshot` schema.

## Interface: SessionSnapshot
```typescript
interface SessionSnapshot {
    version: 1;
    timestamp: number;
    page: string;
    selectedCols: string[];
    seriesColors: Record<string, string>;
    columnRanges: Record<string, { from: number; to: number }>;
    adaptiveLineFilters: Array<{ column: string; x1: number; y1: number; x2: number; y2: number; keepAbove: boolean }>;
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

## Interface: ApplySessionOptions
```typescript
interface ApplySessionOptions {
    navigate?: boolean;
    preferHashPage?: boolean;
    metadataTimeRange?: { min: number; max: number } | null;
    currentDatasetRevision?: number;
    announceAdjustments?: boolean;
}
```

## Interface: ApplySessionResult
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
- `captureSession(): SessionSnapshot`
  - Captures the current analysis state as a serializable snapshot.
- `applySession(snap: SessionSnapshot, options?: ApplySessionOptions): ApplySessionResult`
  - Restores appState from a snapshot, handling revision mismatches and range clamping.
- `autoSaveSession(): void`
  - Saves the current session to localStorage.
- `autoRestoreSession(): SessionSnapshot | null`
  - Loads and validates a session snapshot from localStorage.
- `clearSavedSession(): void`
  - Removes the saved session from localStorage.
- `exportSessionToFile(): void`
  - Downloads the current session as a timestamped `.json` file.
- `importSessionFromFile(): void`
  - Opens a file picker and imports a session from a `.json` file.

---
[1]: ./toast.md
[2]: ./router.md#getHashPage
[3]: ../store/index.md