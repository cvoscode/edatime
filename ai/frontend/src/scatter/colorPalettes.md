# ai/frontend/src/scatter/colorPalettes.md
> Categorical color scales, gradient sampling, hex/RGB color math, and color grouping utilities.

## Constants
- `DISTRIBUTION_GROUP_COLORS: string[]` — 8-color palette for categorical distribution groups
- `LOW_CARDINALITY_LIMIT = 8` — max unique values for categorical color grouping

## Variables
- `fmt: Intl.NumberFormat` — number formatter for color values

## Interfaces
```typescript
interface CategoricalColorGroups {
    groups: Map<string | number, string>;
    palette: string[];
}
```

## Functions
- `normalizeHexColor(hex: string): string`
  - Normalizes hex color to 6-character lowercase form with '#' prefix.
- `clampColorChannel(value: number): number`
  - Clamps a color channel value to 0..255 range.
- `hexToRgb(hex: string): { r: number; g: number; b: number }`
  - Converts a hex color string to RGB components.
- `rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string`
  - Converts RGB components to a hex color string.
- `sampleGradient(stops: string[], t: number): string`
  - Samples a gradient at normalized position t (0..1) and returns interpolated hex color.
- `computeColorExtent(values: number[] | null): { min: number; max: number } | null`
  - Computes min/max of finite values in an array; returns null if no finite values.
- `getCategoryColor(index: number): string`
  - Returns the palette color for a category index using modulo wrap.
- `buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null`
  - Groups unique labels into categories with assigned colors; returns null if exceeds LOW_CARDINALITY_LIMIT.
- `paletteForScale(scale: string): string[]`
  - Returns viridis/plasma/inferno gradient stop arrays for a named scale.
