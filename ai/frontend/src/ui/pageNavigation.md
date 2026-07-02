# ai/frontend/src/ui/pageNavigation.md
> Sidebar page navigation, lazy page bootstrap, and active-nav synchronization.

## Functions
- `initPageNavigation(): void` [deps: [preloadPageStyles][1], [pageNeedsDatasetBootstrap][2], [resolveBackingPageName][2]]
  - Binds sidebar navigation, bootstraps dataset-backed pages on demand, dismisses active toasts before page switches, and dispatches `edatime:page-change`.
- `syncActivePageNav(page: string): void`
  - Updates active sidebar classes for the current page.

---
[1]: ../../utils/pageStyles.md#preloadPageStyles
[2]: ../../utils/pageBootstrap.md
