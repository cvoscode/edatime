# frontend/src/ui/analyticsDrawer.ts
> Right-side collapsible analytics panel for timeseries. Toggles open/closed via toolbar button.

## Functions
- `initAnalyticsDrawer(): void`
  - Initializes drawer close button, escape key handler, and backdrop click to close.
- `openDrawer(): void`
  - Shows the analytics drawer and persists state to preferences.
- `closeDrawer(): void`
  - Hides the analytics drawer and persists state to preferences.
- `toggleDrawer(): void`
  - Toggles drawer open/closed state.
