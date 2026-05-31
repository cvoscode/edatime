# ai/frontend/src/ui/composites/RangeChip.md
> Renders a labeled chip showing a name and a range string, optionally clickable.

## Interface: RangeChipProps
```typescript
interface RangeChipProps {
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    onActivate?: () => void;
}
```

## Function: RangeChip
```typescript
function RangeChip(props: RangeChipProps): HTMLDivElement
```
Creates a div with `.name` and `.range` spans; if `onActivate` is provided, makes it focusable and clickable (Enter/Space).

---
[1]: index.md
  - Creates a chip with name and range text, optionally clickable.

## RangeChipProps
- `name: string`
- `range: string`
- `className?: string`
- `ariaLabel?: string`
- `onActivate?: () => void`