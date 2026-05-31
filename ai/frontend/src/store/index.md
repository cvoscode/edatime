# frontend/src/store/index.ts
> Central pub/sub state container. Exports sub-states and backward-compatible `appStateComposite`.

## Exports

### Sub-states
- `chartState` [deps: [chartState][1]]
- `analyticsState` [deps: [analyticsState][2]]
- `uiState` [deps: [uiState][3]]
- `datasetState` [deps: [datasetState][4]]
- `scatterState` [deps: [scatterState][5]]
- `runtimeState` [deps: [runtimeState][6]]

### Setters & Types
All setters re-exported from sub-state modules.

### Event emitter
- `emitStoreEvent<K extends keyof StoreEventMap>(eventName: K, payload: StoreEventMap[K]): void`
- `subscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): () => void`
  - Returns unsubscribe function.
- `unsubscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): void`
- `clearSubscribers(): void`

### Store
- `store.get<K extends keyof ChartState>(key: K): ChartState[K]`
- `store.set<K extends keyof ChartState>(key: K, value: ChartState[K]): void`

### Backward-compatible composite
- `appStateComposite: AppStateType` — Proxy over sub-states; emits deprecation warnings on direct writes. Re-exported as `appState` via `appStateCompat.md` [deps: [appStateCompat][7]].

---
[1]: chartState.md
[2]: analyticsState.md
[3]: uiState.md
[4]: datasetState.md
[5]: scatterState.md
[6]: runtimeState.md
[7]: appStateCompat.md