# frontend/src/platform/pageLifecycle.ts
> Shared page-lifecycle factory that wires init-once + navigation-aware callbacks behind a single `createPageLifecycle` helper.

## Interfaces
- `PageLifecycleOptions`
  - `page: string` — page name matched against the typed navigation payload.
  - `init(): (() => void) | void` — one-time setup called on first activation; optional cleanup return.
  - `onEveryPageChange?: () => void` — fires on every navigation event regardless of target.
  - `onVisible?: () => void` — fires only when the registered page becomes visible.
- `PageLifecycle`
  - `activate(): void` — trigger init + `onVisible` without broadcasting a router event.
  - `dispose(): void` — releases the lifecycle scope (removes navigation listener, runs init cleanup).

## Functions
- `createPageLifecycle(options: PageLifecycleOptions): PageLifecycle`
  - Wraps `onNavigationChange(handler)` in a `createLifecycleScope` so cleanup is idempotent. `activate()` is no-op after first init. [deps: [lifecycleScope][1], [navigationEvents][2]]

---
[1]: ./lifecycleScope.md
[2]: ./navigationEvents.md