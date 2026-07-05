# ai/frontend/src/utils/router.md

> URL hash routing for sidebar navigation, with canonical `#page=...` URLs and query-based deep-link fallback on first load.

## Constants
- `VALID_PAGES: Set<string>` — set of public page names accepted by the router.

## Functions
- `getHashPage(): string | null`
  - Reads `page` from the hash first, then falls back to `?page=` for initial deep links.
- `initHashRouting(): void`
  - Binds `edatime:page-change` and `popstate`, then canonicalizes the current URL to a hash route without triggering a second initial navigation.
