# ai/frontend/src/ui/composites/RangeChip.md
> Renders a labeled chip showing a name and a range string, optionally clickable with key routing.

## Type: RangeControlKind
```typescript
type RangeControlKind = 'static' | 'column-range' | 'filter-removal' | 'clear-all';
```

## Interface: RangeChipProps
```typescript
interface RangeChipProps {
    key: string;
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    onActivate?: (key: string) => void;
}
```

## Function: RangeChip
```typescript
function RangeChip(props: RangeChipProps): HTMLDivElement
```
Creates a div with `.name` and `.range` spans; if `onActivate` is provided, makes it focusable and clickable (Enter/Space), routing the chip's `key` to the callback.

---
[1]: index.md

## RangeChipProps
- `key: string` — unique identifier, passed back via onActivate
- `name: string`
- `range: string`
- `className?: string`
- `ariaLabel?: string`
- `onActivate?: (key: string) => void`
