# RangeSlider.ts

Range slider control.

## Functions

### RangeSlider

```typescript
function RangeSlider(props: RangeSliderProps): HTMLInputElement
```

**Props:**

```typescript
interface RangeSliderProps {
    label: string;
    min: number;
    max: number;
    value: number;
    step?: number;
    onInput?: (value: number) => void;
}
```
