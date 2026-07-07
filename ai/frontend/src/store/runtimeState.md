# ai/frontend/src/store/runtimeState.ts
> Runtime state for buffered fetch data, debounce handles, Y-axis mode, and analysis binding.

## Interface `RuntimeState`
- `lastFetchedData: DataObject | null`
- `fetchedWindow: FetchedWindow | null`
- `fetchDebounceId: ReturnType<typeof setTimeout> | null`
- `pendingYMode: YMode | null`
- `pendingRestoreY: { min: number; max: number } | null`
- `analysisBound: boolean`
- `refetchOnZoom: boolean`

## Exports
- `runtimeState: RuntimeState`
- `setLastFetchedData(data: DataObject | null): void`
- `setFetchedWindow(window: FetchedWindow | null): void`
- `setFetchDebounceId(id: ReturnType<typeof setTimeout> | null): void`
- `setPendingYMode(mode: YMode | null): void`
- `setPendingRestoreY(range: { min: number; max: number } | null): void`
- `setAnalysisBound(bound: boolean): void`
- `setRefetchOnZoom(refetch: boolean): void`
