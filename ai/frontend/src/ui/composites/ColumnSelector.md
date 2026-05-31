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
Creates a div with a ColorBySelect and one SeriesChip per column, wired to toggle, color-input, color-by, and range callbacks.

---
[1]: ColorBySelect.md
[2]: SeriesChip.md
[3]: index.md
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