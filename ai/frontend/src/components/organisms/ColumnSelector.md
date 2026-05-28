# ColumnSelector.ts

Column selection UI.

## Functions

### ColumnSelector

```typescript
function ColumnSelector(props: ColumnSelectorProps): HTMLDivElement
```

**Props:**

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
