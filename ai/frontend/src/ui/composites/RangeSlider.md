# frontend/src/ui/composites/RangeSlider.ts
> Accessible range slider input.

## Function: RangeSlider
- `RangeSlider(props: RangeSliderProps): HTMLInputElement`
  - Creates an `<input type="range">` with label and value callback.

## RangeSliderProps
- `label: string`
- `min: number`
- `max: number`
- `value: number`
- `step?: number`
- `onInput?: (value: number) => void`