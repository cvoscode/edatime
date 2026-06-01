# app/shell.md

> Wires all UI modules, routing, keyboard shortcuts, theme toggle, and sample dataset loading into the app shell.

## Functions

- `initAppShell(deps: AppShellDeps): void`
  - Initialises all panels, routing, shortcuts, command palette, provenance, guided workflow, data-mutation modals, and analytics listeners.
- `initThemeToggle(): void`
  - Attaches a click handler to `#theme-toggle-btn` and syncs icon visibility with localStorage and `prefers-color-scheme`.
- `humanizeControlId(id: string): string`
  - Converts kebab/camel IDs into Title Case for accessible form labels.
- `normalizeFormControlAccessibility(): void`
  - Ensures every form control has `name` and `aria-label` derived from labels, placeholder, or title.
- `wireHomeNavigationCards(showPage: (pageName: string) => void): void`
  - Attaches click listeners to `[data-home-nav]` elements to switch pages.
- `wireSampleDatasetCards(showPage: (pageName: string) => void): void`
  - Attaches click listeners to `[data-sample-dataset]` elements to load ETTm2 or weather CSVs and navigate to the upload page.
- `generateSinusoidalCsv(): string`
  - Generates a synthetic sinusoidal CSV with timestamp, temperature, humidity, pressure columns.
- `generateWeatherCsv(): string`
  - Generates a synthetic weather CSV with diurnal and multi-day patterns.
- `loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>`
  - Fetches or generates a sample CSV and simulates a file input change event to trigger the upload flow.

## AppShellDeps Interface

- `ensurePageModuleLoaded(page: string): Promise<void>`
- `showPage(pageName: string): void`
- `fetchAndRender(): void`
- `renderCurrentData(): void`
- `updateAnalysisYRange(min: number, max: number, sourceKind?: string): void`
- `buildTimeseriesColumns(): void` [deps: [columnsController][13]]
- `buildTimeseriesRanges(): void` [deps: [columnsController][13]]
- `zoomOut(): void`
- `resetZoom(): void`
- `initAnalyticsListeners(): void`
- `refreshDatasetAfterMutation(options?: RefreshDatasetOptions): Promise<void>`
- `hydrateColumnProfiles(...args: any[]): void`
- `renderColumnProfilesGrid(...args: any[]): void`
- `registerCleanup(cleanup: () => void): void`

---
[1]: ../ui/upload.md
[2]: ../ui/profile.md
[3]: ../ui/toolbar.md
[4]: ../features/timeseries/columnsController.md
[5]: ../utils/router.md
[6]: ../utils/palette.md
[7]: ../utils/provenance.md
[8]: ../utils/settings.md
[9]: ../utils/a11y.md
[10]: ../bootstrap/commands.md
[11]: ../bootstrap/shortcuts.md
[12]: ../chart/annotations.md
[13]: ../features/timeseries/columnsController.md
