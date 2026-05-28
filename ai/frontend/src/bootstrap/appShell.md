# ai/frontend/src/bootstrap/appShell.md
> Main application shell layout — wires UI panels, routing, theme, settings, and analytics.

## Functions
- `initAppShell(deps: AppShellDeps): void`
  - Initialize the app shell with all UI panels, hash routing, theme toggle, keyboard shortcuts, command palette, and analytics listeners.

## Interfaces
- `AppShellDeps`
  - `ensurePageModuleLoaded: (page: string) => Promise<void>`
  - `showPage: (pageName: string) => void`
  - `fetchAndRender: () => void`
  - `renderCurrentData: () => void`
  - `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
  - `zoomOut: () => void`
  - `resetZoom: () => void`
  - `initAnalyticsListeners: () => void`
  - `refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>`
  - `hydrateColumnProfiles: (...args: any[]) => void`
  - `renderColumnProfilesGrid: (...args: any[]) => void`
  - `registerCleanup: (cleanup: () => void) => void`

- `RefreshDatasetOptions`
  - `selectedColumn?: string`
