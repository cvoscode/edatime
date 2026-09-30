# ai/frontend/src/ui/primitives/ColorPicker.md
> Compact color-picker popover with preset swatches, hex input, and hidden native-picker fallback.

## Interfaces
- `ColorPickerProps` — `{ label: string; value: string; id?: string; className?: string; onInput?: (value: string, event: Event) => void }`
- `ColorPickerHandle` — `{ element: HTMLDivElement; updateValue: (next: string) => void }`

## Functions
- `ColorPicker(props: ColorPickerProps): ColorPickerHandle`
  - Builds the swatch button, preset popover, hex editor, and native fallback input, and returns an imperative `updateValue` hook for external color sync.
