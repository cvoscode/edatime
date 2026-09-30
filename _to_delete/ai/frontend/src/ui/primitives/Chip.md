# ai/frontend/src/ui/primitives/Chip.md
> Renders a clickable chip/span element with optional active state and accent color.

## Interface: ChipProps
```typescript
interface ChipProps {
    label: string;
    className?: string;
    active?: boolean;
    accent?: string;
    onClick?: (event: MouseEvent) => void;
}
```

## Function: Chip
```typescript
function Chip(props: ChipProps): HTMLSpanElement
```
Creates a `<span>` chip element with optional active class and CSS custom-property accent.

---
[1]: index.md
  - Creates a styled span element.

## ChipProps
- `label: string`
- `className?: string`
- `color?: string`