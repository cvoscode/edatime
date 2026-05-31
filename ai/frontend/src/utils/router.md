# ai/frontend/src/utils/router.md

> URL hash routing that maps `#page=timeseries` to sidebar navigation, supporting browser back/forward and deep-link bookmarks.

## Constants
- `VALID_PAGES: Set<string>` — set of all valid page names.
- `PAGE_ALIASES: Record<string, string>` — maps old/renamed page names to their current equivalents.

## Functions
- `getHashPage(): string | null`
  - Reads the current page from the URL hash, resolving aliases.
- `resolvePageAlias(page: string): string`
  - Resolves a page name through the alias map.
- `initHashRouting(): void`
  - Binds hash routing to the page navigation system; listens for `edatime:page-change` and `popstate`.