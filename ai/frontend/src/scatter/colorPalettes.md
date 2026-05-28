# colorPalettes.ts

Color palette definitions, gradient sampling, and color math utilities.

## Constants

```typescript
DISTRIBUTION_GROUP_COLORS: string[]
LOW_CARDINALITY_LIMIT: 8
```

## Functions

```typescript
function normalizeHexColor(hex: string): string
function clampColorChannel(value: number): number
function hexToRgb(hex: string): { r: number; g: number; b: number }
function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string
function sampleGradient(stops: string[], t: number): string
function computeColorExtent(values: number[] | null): { min: number; max: number } | null
function getCategoryColor(index: number): string
function buildCategoricalColorGroups(labels?: unknown[] | null): CategoricalColorGroups | null
function paletteForScale(scale: string): string[]
```

## Interfaces

```typescript
interface CategoricalColorGroups {
    groups: Map<string | number, string>;
    palette: string[];
}
```
