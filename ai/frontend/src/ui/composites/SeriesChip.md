# frontend/src/ui/composites/SeriesChip.ts
> Series toggle chip with color picker and optional adaptive-target state.

## Function: SeriesChip
- `SeriesChip(props: SeriesChipProps): HTMLLabelElement`
  - Creates a labeled checkbox chip with color styling and menu trigger.

## SeriesChipProps
- `column: string`
- `checked: boolean`
- `color: string`
- `disabled?: boolean`
- `adaptiveTarget?: boolean`
- `menuLabel?: string`
- `label?: string`
- `title?: string`
- `onToggle?: (checked: boolean) => void`
- `onColorInput?: (color: string) => void`
- `onMenuClick?: () => void`