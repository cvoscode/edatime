# ai/frontend/src/store/runtimeState.ts
> Runtime state for fetch management and analysis coordination.

## Interface

```typescript
export interface RuntimeState {
    lastFetchedData: DataObject | null;
    fetchDebounceId: ReturnType<typeof setTimeout> | null;
    pendingYMode: YMode | null;
    pendingRestoreY: { min: number; max: number } | null;
    analysisBound: boolean;
    refetchOnZoom: boolean;
}
```

## State

```typescript
export const runtimeState: RuntimeState
```

## Functions

```typescript
export function setLastFetchedData(data: DataObject | null): void
export function setFetchDebounceId(id: ReturnType<typeof setTimeout> | null): void
export function setPendingYMode(mode: YMode | null): void
export function setPendingRestoreY(range: { min: number; max: number } | null): void
export function setAnalysisBound(bound: boolean): void
export function setRefetchOnZoom(refetch: boolean): void
```