# SeriesChip.ts

Series selection chip.

## Functions

### SeriesChip

```typescript
function SeriesChip(props: SeriesChipProps): HTMLLabelElement
```

**Props:**

```typescript
interface SeriesChipProps {
    column: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    menuLabel?: string;
    label?: string;
    title?: string;
    onToggle?: (checked: boolean) => void;
    onColorInput?: (color: string) => void;
    onMenuClick?: () => void;
}
```
