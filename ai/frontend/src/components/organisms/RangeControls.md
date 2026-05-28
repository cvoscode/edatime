# RangeControls.ts

Range control panel.

## Types

```typescript
interface RangeControlItem {
    name: string;
    range: string;
    ariaLabel?: string;
}
```

## Functions

### RangeControls

```typescript
function RangeControls(props: RangeControlsProps): HTMLDivElement
```

**Props:**

```typescript
interface RangeControlsProps {
    items: RangeControlItem[];
    onActivate?: (item: RangeControlItem) => void;
}
```
