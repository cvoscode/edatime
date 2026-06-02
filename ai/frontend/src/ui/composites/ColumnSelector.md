# ai/frontend/src/ui/composites/ColumnSelector.md
> Renders a list of series chips with per-column color pickers and an optional color-by selector.

## Interface: ColumnSelectorProps
```typescript
interface ColumnSelectorProps {
    columns: string[];
    selected: string[];
    colors: Record<string, string>;
    colorBy: string | null;
    onToggle?: (column: string, checked: boolean) => void;
    onColorInput?: (column: string, color: string) => void;
    onColorByChange?: (column: string | null) => void;
    onOpenRange?: (column: string) => void;
}
```

## Function: ColumnSelector
```typescript
function ColumnSelector(props: ColumnSelectorProps): HTMLDivElement
```
Creates a div with ColorBySelect and a chip container backed by `renderSeriesChipList`, which handles keyboard binding, incremental updates, and `preserveExisting` mode.

---
[1]: ColorBySelect.md
[2]: ../../seriesChipList.md#renderSeriesChipList

## ColumnSelectorProps
- `columns: string[]`
- `selected: string[]`
- `colors: Record<string, string>`
- `colorBy: string | null`
- `onToggle?: (column: string, checked: boolean) => void`
- `onColorInput?: (column: string, color: string) => void`
- `onColorByChange?: (column: string | null) => void`
- `onOpenRange?: (column: string) => void`
