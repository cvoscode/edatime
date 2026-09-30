# ai/frontend/src/ui/composites/RangeControls.md
> Renders a horizontal row of RangeChips with per-item key routing and a backward-compatible top-level onActivate.

## Type: RangeControlKind
```typescript
type RangeControlKind = 'static' | 'column-range' | 'filter-removal' | 'clear-all';
```

## Interface: RangeControlItem
```typescript
interface RangeControlItem {
    key: string;
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    kind?: RangeControlKind;
    onActivate?: (key: string) => void;
}
```

## Interface: RangeControlsProps
```typescript
interface RangeControlsProps {
    items: RangeControlItem[];
    onActivate?: (item: RangeControlItem) => void;
}
```

## Function: RangeControls
```typescript
function RangeControls(props: RangeControlsProps): HTMLDivElement
```
Creates a div containing one RangeChip per item. Per-item `onActivate` (if provided) receives the chip key; otherwise falls back to the top-level `onActivate` with full item. Static chips (kind='static') are never interactive.

---
[1]: RangeChip.md

## RangeControlsProps
- `items: RangeControlItem[]`
- `onActivate?: (item: RangeControlItem) => void` — legacy top-level callback

## RangeControlItem
- `key: string` — unique identifier
- `name: string`
- `range: string`
- `className?: string`
- `ariaLabel?: string`
- `kind?: RangeControlKind` — determines interactivity; 'static' suppresses keyboard/click
- `onActivate?: (key: string) => void` — per-item callback; receives key not full item
