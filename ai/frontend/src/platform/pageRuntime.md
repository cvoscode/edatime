# frontend/src/platform/pageRuntime.ts
> Per-page runtime host that wires page lifecycle to a DOM empty-state controller and optional status/loading elements.

## Interfaces
- `PageRuntimeOptions`
  - `page: string` — page name matched against the navigation payload.
  - `emptyStateRootId?: string` — DOM id of the empty-state container.
  - `emptyStateTitleId?`, `emptyStateMessageId?` — optional child element ids for brand-illustrated empty state (heading + body).
  - `statusElId?`, `loadingElId?` — optional DOM ids for status text and loading indicator.
  - `init?: () => void | (() => void)` — passed to `createPageLifecycle`.
  - `onVisible?: () => void`, `onEveryPageChange?: () => void` — lifecycle callbacks.
- `PageRuntime`
  - `mount(): () => void` — registers lifecycle. Idempotent; calling twice returns a no-op unregister. Calling the returned cleanup disposes the lifecycle and runs init's cleanup.
  - `activate(): void` — re-runs init + onVisible.
  - `updateEmptyState(model: EmptyStateViewModel): void`
  - `updateStatus(text: string): void` — sets `textContent` on the status element.
  - `setLoading(loading: boolean): void` — toggles `hidden` attribute on the loading element.

## Functions
- `createPageRuntime(options: PageRuntimeOptions): PageRuntime` [deps: [pageLifecycle][1], [ui/emptyState][2]]

---
[1]: ./pageLifecycle.md
[2]: ../ui/emptyState.md