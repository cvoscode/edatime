# frontend/src/ui/profile.ts
> Column profile grid (virtualised table on the Upload page).

## Interfaces
- `ProfileRow`: `{ name, dtype, nonNullCount, nullCount, min, max, histCounts }`

## Module-level State
- `cachedFilteredProfiles: ProfileRow[] | null` — memoized profile view-model.
- `cachedFilteredProfilesKey: string | null` — cache key based on `(profiles.length|q|sortKey|sortDir)`.

## Functions
- `sortProfileRows(profiles: ProfileRow[], sortKey, sortDir): ProfileRow[]`
  - Sorts profile rows by a column key.
- `getFilteredColumnProfiles(): ProfileRow[]`
  - Returns cached filtered+sorted profiles; recomputes and caches on cache miss or `invalidateProfileGridViewModel()`.
- `invalidateProfileGridViewModel(): void`
  - Resets the memoized profile view-model cache. Called by `hydrateColumnProfiles` after profiles change.
- `hydrateColumnProfiles(metadata: DatasetMetadata): void`
  - Populates appState.columnProfiles from API metadata and calls `invalidateProfileGridViewModel()`.
- `renderColumnProfilesGrid(resetScroll?: boolean): void`
  - Renders the virtualized column profile grid.
- `initColumnProfilesGrid(): void`
  - Initializes profile grid scroll (throttled via `requestAnimationFrame` to coalesce rapid scroll events) and resize observers.
