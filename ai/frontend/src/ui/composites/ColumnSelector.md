# frontend/src/ui/composites/ColumnSelector.ts
> Full column selection UI with color-by and per-series chips.

## Function: ColumnSelector
- `ColumnSelector(props: ColumnSelectorProps): HTMLDivElement`
  - Creates a composite with ColorBySelect and per-column SeriesChip components.

## ColumnSelectorProps
- `columns: string[]`
- `selected: string[]`
- `colors: Record<string, string>`
- `colorBy: string | null`
- `onToggle?: (column: string, checked: boolean) => void`
- `onColorInput?: (column: string, color: string) => void`
- `onColorByChange?: (column: string | null) => void`
- `onOpenRange?: (column: string) => void`