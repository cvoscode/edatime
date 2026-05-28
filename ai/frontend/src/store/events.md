# frontend/src/store/events.ts
> Simple pub/sub event emitter for store changes.

## Types

### `StoreChange<T>`
- `next: T`
- `previous: T`

### `StoreEventMap`
Full map of event names → payload types for all sub-states (chart, analytics, ui, dataset, runtime, scatter).

### `StoreHandler<K>`
- `(payload: StoreEventMap[K]) => void`

## Functions

- `emitStoreEvent<K extends keyof StoreEventMap>(eventName: K, payload: StoreEventMap[K]): void`
- `subscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): () => void`
  - Returns unsubscribe function.
- `unsubscribe<K extends keyof StoreEventMap>(eventName: K, handler: StoreHandler<K>): void`
- `clearSubscribers(): void`