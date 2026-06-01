# ai/frontend/src/app/shell.md
> Wires the shared app shell, page routing, sample datasets, upload/bootstrap surfaces, and shell-level keyboard tooling.

## Interface: RefreshDatasetOptions
- `selectedColumn?: string`

## Interface: AppShellDeps
- `ensurePageModuleLoaded: (page: string) => Promise<void>`
- `showPage: (pageName: string) => void`
- `fetchAndRender: () => void`
- `renderCurrentData: () => void`
- `updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void`
- `buildTimeseriesColumns: () => void`
- `buildTimeseriesRanges: () => void`
- `zoomOut: () => void`
- `resetZoom: () => void`
- `initAnalyticsListeners: () => void`
- `refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>`
- `hydrateColumnProfiles: (...args: any[]) => void`
- `renderColumnProfilesGrid: (...args: any[]) => void`
- `registerCleanup: (cleanup: () => void) => void`

## Functions
- `initThemeToggle(): void`
  - Syncs theme state with localStorage, system preference, and the theme toggle button.
- `humanizeControlId(id: string): string`
  - Converts a control id into readable Title Case fallback text.
- `normalizeFormControlAccessibility(): void`
  - Ensures form controls have `name` and `aria-label` values.
- `wireHomeNavigationCards(showPage: (pageName: string) => void): void`
  - Connects home navigation cards to page changes.
- `wireSampleDatasetCards(showPage: (pageName: string) => void): void`
  - Connects sample dataset cards to the sample-loader flow.
- `generateSinusoidalCsv(): string`
  - Builds a synthetic sinusoidal CSV sample.
- `generateWeatherCsv(): string`
  - Builds a synthetic weather CSV sample.
- `loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>` [deps: [fetchSampleDataset][1]]
  - Loads a built-in sample dataset or generated CSV into the upload flow.
- `initAppShell(deps: AppShellDeps): void` [deps: [initUploadPanel][2], [initAnalysisControls][3], [initKeyboardShortcuts][4]]
  - Initializes the shared shell, shared panels, upload bootstrap, command surfaces, and analytics listeners.

---
[1]: ../services/api/metadata.md#fetchSampleDataset
[2]: ../ui/upload.md#initUploadPanel
[3]: ../ui/toolbar.md#initAnalysisControls
[4]: ../bootstrap/shortcuts.md#initKeyboardShortcuts
