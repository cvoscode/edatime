# frontend/src/ui/composites/RangeControls.ts
> Collection of RangeChip items.

## Function: RangeControls
- `RangeControls(props: RangeControlsProps): HTMLDivElement`
  - Creates a container with multiple RangeChip components.

## RangeControlsProps
- `items: RangeControlItem[]`
- `onActivate?: (item: RangeControlItem) => void`

## RangeControlItem
- `name: string`
- `range: string`
- `ariaLabel?: string`