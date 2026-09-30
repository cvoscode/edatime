# ai/frontend/src/utils/settings.md

> Application settings management: theme, layout, palette, export defaults, and analytics preferences persisted to localStorage. `applyTheme` resolves the effective theme and pushes it into the store via `setResolvedTheme`.

## Types
```typescript
type ThemeMode = 'dark' | 'light' | 'auto';
type LayoutDensity = 'compact' | 'roomy' | 'spacious';
type ExportFormat = 'png' | 'svg' | 'csv' | 'json' | 'parquet';
type CorrelationMetric = 'pearson' | 'spearman';
type ColorScaleName = 'viridis' | 'plasma' | 'magma' | 'coolwarm' | 'inferno';
```

## Interface: AppSettings
```typescript
interface AppSettings {
    theme: ThemeMode;
    layoutDensity: LayoutDensity;
    defaultPalette: string;
    defaultExportFormat: ExportFormat;
    whiteBackgroundExport: boolean;
    defaultCorrelationMetric: CorrelationMetric;
    defaultCausalMethod: string;
    defaultTauMax: number;
    defaultFftPreset: string;
    drawAutoReset: boolean;
    colorScale: ColorScaleName;
    sidebarCollapsed: boolean;
    analyticsDrawerOpen: boolean;
}
```

## Constants
- `COLOR_SCALES: Record<ColorScaleName, string[]>` — perceptual uniform colormaps for continuous color-by gradients.
- `DEFAULT_SETTINGS: AppSettings` — defaults for all settings.

## Functions
- `getColorFromScale(v: number, scaleName: ColorScaleName): string`
  - Interpolates a color from a named scale for a normalized value `v` ∈ [0, 1].
- `applyTheme(theme: ThemeMode): void`
  - Resolves the effective theme (`dark`/`light`) for `auto` mode by reading `window.matchMedia('(prefers-color-scheme: light)')`. Calls `setResolvedTheme(effectiveTheme)` to push the resolved value into the store, and toggles the theme toggle icons.
- `applyLayoutDensity(density: LayoutDensity): void`
  - Applies the layout density class to the document body.
