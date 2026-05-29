# frontend/src/app/shell.md
> Application shell bootstrap — wires global services, theme, routing, and page navigation.

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
```

## Functions

### initAppShell
- `initAppShell(deps: AppShellDeps): void`
  - Initializes all global shell services: routing, settings, annotations, panels, analytics, theme, keyboard shortcuts, command palette, provenance, data mutation modals.

### initThemeToggle
- `initThemeToggle(): void`
  - Sets up theme toggle button and syncs with localStorage and OS preference.

### normalizeFormControlAccessibility
- `normalizeFormControlAccessibility(): void`
  - Ensures all form controls have accessible names via aria-label or associated labels.

### humanizeControlId
- `humanizeControlId(id: string): string`
  - Converts kebab/camel case IDs to human-readable label format.

### wireHomeNavigationCards
- `wireHomeNavigationCards(showPage: (pageName: string) => void): void`
  - Wires `[data-home-nav]` elements to navigate to target pages.

### wireSampleDatasetCards
- `wireSampleDatasetCards(showPage: (pageName: string) => void): void`
  - Wires `[data-sample-dataset]` elements to load built-in sample datasets (ettm2, sinusoidal, weather).

### loadSampleDataset
- `loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>`
  - Loads a built-in sample dataset and triggers upload flow.

### generateSinusoidalCsv
- `generateSinusoidalCsv(): string`
  - Generates sinusoidal test CSV with temperature, humidity, pressure.

### generateWeatherCsv
- `generateWeatherCsv(): string`
  - Generates weather test CSV with temperature, humidity, pressure, wind_speed.

## Interface: RefreshDatasetOptions
```typescript
interface RefreshDatasetOptions {
    selectedColumn?: string;
}