# frontend/src/app/shell.ts
> Application shell bootstrap — wires global services, theme, routing, page navigation, and all persistent UI panels.

## Interface: AppShellDeps
```typescript
interface AppShellDeps {
    ensurePageModuleLoaded: (page: string) => Promise<void>;
    showPage: (pageName: string) => void;
    fetchAndRender: () => void;
    renderCurrentData: () => void;
    updateAnalysisYRange: (min: number, max: number, sourceKind?: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
    initAnalyticsListeners: () => void;
    refreshDatasetAfterMutation: (options?: RefreshDatasetOptions) => Promise<void>;
    hydrateColumnProfiles: (...args: any[]) => void;
    renderColumnProfilesGrid: (...args: any[]) => void;
    registerCleanup: (cleanup: () => void) => void;
}

interface RefreshDatasetOptions {
    selectedColumn?: string;
}
```

## Functions

### initAppShell
- `initAppShell(deps: AppShellDeps): void`
  - Initializes all global shell services: hash routing, settings, annotations, annotation panel, guided workflow, analytics drawer, settings panel, accessibility shortcuts, theme toggle, upload panel, column profiles grid, analysis controls, column filter modal, chart page filter gesture, keyboard shortcuts, command palette, provenance, app commands, transform modal, outlier modal, and analytics listeners.
  - Wires `window.__edatime.ensurePageModuleLoaded` for debugging.
  - Wires home navigation cards and sample dataset cards to `deps.showPage`.

### initThemeToggle
- `initThemeToggle(): void`
  - Sets up theme toggle button; persists to `localStorage['edatime-theme']` and syncs with `prefers-color-scheme`.

### normalizeFormControlAccessibility
- `normalizeFormControlAccessibility(): void`
  - Ensures all `input`, `select`, `textarea` elements have accessible names via `name`, `aria-label`, or derived fallback from labels/placeholder/title.

### humanizeControlId
- `humanizeControlId(id: string): string`
  - Converts kebab/camel/underscore IDs to Title Case human-readable labels.

### wireHomeNavigationCards
- `wireHomeNavigationCards(showPage: (pageName: string) => void): void`
  - Attaches click listeners to all `[data-home-nav]` elements, calling `showPage(target)`.

### wireSampleDatasetCards
- `wireSampleDatasetCards(showPage: (pageName: string) => void): void`
  - Attaches click listeners to all `[data-sample-dataset]` elements, calling `loadSampleDataset(datasetId, showPage)`.

### generateSinusoidalCsv
- `generateSinusoidalCsv(): string`
  - Generates a 7-day synthetic CSV (`timestamp,temperature,humidity,pressure`) at 15-minute intervals with sinusoidal patterns.

### generateWeatherCsv
- `generateWeatherCsv(): string`
  - Generates a 7-day synthetic CSV (`timestamp,temperature,humidity,pressure,wind_speed`) at 10-minute intervals with diurnal patterns.

### loadSampleDataset
- `loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>`
  - Loads built-in sample dataset (`ettm2` via fetch, `sinusoidal`/`weather` via generation) and dispatches to upload panel.