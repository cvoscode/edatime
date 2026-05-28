# settings.ts

Application settings management with localStorage persistence for theme, layout, palettes, export formats, and analytics preferences.

## Types

```typescript
type ThemeMode = 'dark' | 'light' | 'auto'
type LayoutDensity = 'compact' | 'spacious'
type ExportFormat = 'png' | 'svg' | 'csv' | 'json' | 'parquet'
type CorrelationMetric = 'pearson' | 'spearman'
type ColorScaleName = 'viridis' | 'plasma' | 'magma' | 'coolwarm' | 'inferno'
```

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

```typescript
const COLOR_SCALES: Record<ColorScaleName, string[]>
```

Perceptually uniform colormaps for continuous color-by gradients.

```typescript
const DEFAULT_SETTINGS: AppSettings
```

Default application settings.

```typescript
const CHART_PALETTES: Record<string, string[]>
```

Predefined color palettes for charts.

## Functions

```typescript
function getColorFromScale(v: number, scaleName: ColorScaleName): string
```

Interpolate a color from a COLOR_SCALE for normalized value v in [0, 1].

```typescript
function loadSettings(): AppSettings
```

Load settings from localStorage, falling back to defaults.

```typescript
function saveSettings(settings: AppSettings): void
```

Save settings to localStorage.

```typescript
function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K]
```

Get a single setting value.

```typescript
function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void
```

Update a single setting and save.

```typescript
function applyTheme(theme: ThemeMode): void
```

Apply theme to the document.

```typescript
function applyLayoutDensity(density: LayoutDensity): void
```

Apply layout density to the document.

```typescript
function applyAllSettings(settings: AppSettings): void
```

Apply all settings at once.

```typescript
function initSettings(): AppSettings
```

Initialize settings from storage and apply them.