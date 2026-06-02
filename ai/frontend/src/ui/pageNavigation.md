# ai/frontend/src/ui/pageNavigation.md
> Sidebar navigation and page switching. Extracted from toolbar.ts to reduce its size and improve maintainability.

## Functions
- `initPageNavigation(): void` [deps: [preloadPageStyles][1], [pageNeedsDatasetBootstrap][2]]
  - Wires sidebar nav button click listeners; initializes collapse button; sets default page to 'home'.
  - On click: preloads page styles, bootstraps dataset if needed, loads page module, hides/shows `.page` elements, toggles nav active classes, dispatches `edatime:page-change` event.
- `syncActivePageNav(page: string): void`
  - Toggles `active` class on sidebar nav items to reflect current page.

---
[1]: ../../utils/pageStyles.md#preloadPageStyles
[2]: ../../utils/pageBootstrap.md#pageNeedsDatasetBootstrap
