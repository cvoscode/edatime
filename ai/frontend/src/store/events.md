# ai/frontend/src/store/events.md
> Simple pub/sub event emitter for store changes.

## Types
- `StoreChange<T>`
  - `{ next: T; previous: T }`
- `StoreEventMap`
  - Full event-name map for chart, analytics, dataset, runtime, scatter, and UI changes.
  - Recent additions include `analytics:anomalyGlobalEnabled`, `analytics:anomalySummaryStats`, and `runtime:fetchedWindow`.
- `StoreHandler<K>`
  - `(payload: StoreEventMap[K]) => void`

## Functions
- `emitStoreEvent<K extends keyof StoreEventMap>(eventName: K, payload: StoreEventMap[K]): void`
- `subscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): () => void`
- `unsubscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): void`
- `clearSubscribers(): void`
