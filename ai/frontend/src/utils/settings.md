# ai/frontend/src/utils/settings.md

> Application settings management: theme, layout, palette, export defaults, and analytics preferences persisted to localStorage.

## Types
```typescript
type ThemeMode = 'dark' | 'light' | 'auto';
type LayoutDensity = 'compact' | 'spacious';
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