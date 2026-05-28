# frontend/src/ui/profile.ts
> Column profile grid (virtualised table on the Upload page).

## Interfaces
- `ProfileRow`: `{ name, dtype, nonNullCount, nullCount, min, max, histCounts }`

## Functions
- `sortProfileRows(profiles: ProfileRow[], sortKey, sortDir): ProfileRow[]`
  - Sorts profile rows by a column key.
- `hydrateColumnProfiles(metadata: DatasetMetadata): void`
  - Populates appState.columnProfiles from API metadata.
- `renderColumnProfilesGrid(resetScroll?: boolean): void`
  - Renders the virtualized column profile grid.
- `initColumnProfilesGrid(): void`
  - Initializes profile grid scroll and resize observers.
