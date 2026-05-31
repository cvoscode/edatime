# ai/frontend/src/store/runtimeState.ts
> Runtime state for fetch debouncing, data cache, Y-axis mode, and analysis binding.

## Interface `RuntimeState`
- `lastFetchedData: DataObject | null`
- `fetchDebounceId: ReturnType<typeof setTimeout> | null`
- `pendingYMode: YMode | null`
- `pendingRestoreY: { min: number; max: number } | null`
- `analysisBound: boolean`
- `refetchOnZoom: boolean`

## Exports

### State
- `runtimeState: RuntimeState`

### Mutations
- `setLastFetchedData(data: DataObject | null): void`
- `setFetchDebounceId(id: ReturnType<typeof setTimeout> | null): void`
- `setPendingYMode(mode: YMode | null): void`
- `setPendingRestoreY(range: { min: number; max: number } | null): void`
- `setAnalysisBound(bound: boolean): void`
- `setRefetchOnZoom(refetch: boolean): void`

---
[1]: events.md