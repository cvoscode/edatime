# ai/frontend/src/store/index.md
> Central pub/sub state container that re-exports sub-states and exposes the backward-compatible `appState` composite.

## Sub-states
- `chartState`
- `analyticsState`
- `uiState`
- `datasetState`
- `scatterState`
- `runtimeState`

## Events
- `emitStoreEvent<K extends keyof StoreEventMap>(eventName: K, payload: StoreEventMap[K]): void`
- `subscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): () => void`
- `unsubscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): void`
- `clearSubscribers(): void`

## Composite store
- `store.get<K extends keyof ChartState>(key: K): ChartState[K]`
- `store.set<K extends keyof ChartState>(key: K, value: ChartState[K]): void`
- `appStateComposite: AppStateType`
  - Proxy over sub-states; now includes `anomalyGlobalEnabled`, `anomalySummaryStats`, and `fetchedWindow` accessors alongside the existing analytics/runtime fields.
