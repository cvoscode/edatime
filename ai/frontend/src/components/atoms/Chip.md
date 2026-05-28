# Chip.ts

Chip/tag component.

## Functions

### Chip

```typescript
function Chip(props: ChipProps): HTMLSpanElement
```

**Props:**

```typescript
interface ChipProps {
    label: string;
    className?: string;
    active?: boolean;
    accent?: string;
    onClick?: (event: MouseEvent) => void;
}
```
