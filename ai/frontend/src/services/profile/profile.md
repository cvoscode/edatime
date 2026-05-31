# services/profile/profile.md

> Configures the column profile grid layout: column definitions, sizing constants, and default widths.

## Constants

- `PROFILE_ROW_HEIGHT: number = 38`
  - Fixed row height in pixels for virtualized profile rows.
- `PROFILE_OVERSCAN: number = 8`
  - Number of off-screen rows to render for smooth scrolling.
- `PROFILE_COLUMNS: ProfileColumnDef[]`
  - Column descriptors for the profile grid: `selected`, `name`, `dtype`, `nonNullCount`, `nullCount`, `min`, `max`, `histCounts`.

## Functions

- `getDefaultProfileColumnWidths(): number[]`
  - Returns an array of default widths matching the `PROFILE_COLUMNS` order.