# ai/frontend/src/pages/shared/pageRuntime.md
> Shared page lifecycle factory — registers a page with `createPageLifecycle`, manages empty-state controller, status element, and loading element.

## Interface: PageRuntimeOptions
```ts
interface PageRuntimeOptions {
    page: string;
    emptyStateRootId?: string;
    statusElId?: string;
    loadingElId?: string;
    init?: () => void | (() => void);
    onVisible?: () => void;
    onEveryPageChange?: () => void;
}
```

## Interface: PageRuntime
```ts
interface PageRuntime {
    mount(): () => void;
    updateEmptyState(model: EmptyStateViewModel): void;
    updateStatus(text: string): void;
    setLoading(loading: boolean): void;
}
```

## Functions
- `createPageRuntime(options: PageRuntimeOptions): PageRuntime` [deps: [createPageLifecycle][1], [createEmptyStateController][2]]
  - Returns `PageRuntime` with `mount()` (registers lifecycle, returns cleanup), `updateEmptyState(model)` (forwards to empty-state controller), `updateStatus(text)` (sets `textContent` on status element), `setLoading(loading)` (shows/hides loading element).

---
[1]: ../../../app/pageLifecycle.md#createPageLifecycle
[2]: ../../../ui/emptyState.md#createEmptyStateController