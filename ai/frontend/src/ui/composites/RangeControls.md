# ai/frontend/src/ui/composites/RangeControls.md
> Renders a horizontal row of RangeChips wired to an activation callback.

## Interfaces
```typescript
interface RangeControlItem {
    name: string;
    range: string;
    ariaLabel?: string;
}

interface RangeControlsProps {
    items: RangeControlItem[];
    onActivate?: (item: RangeControlItem) => void;
}
```

## Function: RangeControls
```typescript
function RangeControls(props: RangeControlsProps): HTMLDivElement
```
Creates a div containing one RangeChip per item, forwarding each item to `onActivate`.

---
[1]: RangeChip.md
[2]: index.md
  - Creates a container with multiple RangeChip components.

## RangeControlsProps
- `items: RangeControlItem[]`
- `onActivate?: (item: RangeControlItem) => void`

## RangeControlItem
- `name: string`
- `range: string`
- `ariaLabel?: string`