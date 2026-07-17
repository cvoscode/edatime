# frontend/src/platform/featureEvents.ts
> Typed in-process event bus for narrowly scoped feature coordination. Distinct from DOM events; payloads are declared in `FeatureEventMap`.

## Interfaces
- `FeatureEventMap`
  - `'analytics:change': undefined`
  - `'causal:preselect': { columns: string[] }`
  - `'filters:clear': { source: string }`
  - `'session:restored': undefined`
  - `'viewport:reset-request': { source: string }`
  - `'workflow:refresh': undefined`

## Functions
- `emitFeatureEvent<EventName>(eventName, payload): void`
  - Synchronously fires every handler registered for `eventName`.
- `onFeatureEvent<EventName>(eventName, handler): () => void`
  - Returns an unsubscribe function. Cleans up empty handler sets.
- `clearFeatureEventHandlers(): void` — wipes every registration. Test-only.