# frontend/src/platform/navigationEvents.ts
> Typed in-process navigation event bus owned by the router. Backed by a process-global `EventTarget` keyed under `__edatimeNavigationEventTarget` on `globalThis`.

## Interfaces
- `NavigationChange`
  - `page: string`
  - `navPage?: string`
  - `analyticsView?: string | null`

## Functions
- `emitNavigationChange(change: NavigationChange): void`
  - Dispatches a `CustomEvent<NavigationChange>('change', { detail })` on the shared event target.
- `onNavigationChange(listener: (change: NavigationChange) => void): () => void`
  - Adds a `change` listener. Returns an unsubscribe function.