# ai/frontend/src/ui/composites/RangeSlider.md
> Renders a native range input with aria-label, min/max/step, and numeric input handler.

## Interface: RangeSliderProps
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

## Function: RangeSlider
```typescript
function RangeSlider(props: RangeSliderProps): HTMLInputElement
```
Creates an `<input type="range">` with the given bounds and a handler that converts the string value to a number.

---
[1]: index.md
  - Creates an `<input type="range">` with label and value callback.

## RangeSliderProps
- `label: string`
- `min: number`
- `max: number`
- `value: number`
- `step?: number`
- `onInput?: (value: number) => void`