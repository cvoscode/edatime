# frontend/src/ui/seriesChipList.ts
> Shared SeriesChip list orchestration — renders chips into a container, wires keyboard activation, and manages color updates.

## Functions
- `renderSeriesChipList(options: SeriesChipListOptions): void`
  - Renders items into container, adds `chipClass`, wires keyboard handler.
- `updateSeriesChipList(options: SeriesChipListOptions): void`
  - Updates checked/color state without full DOM rebuild.

## SeriesChipListItem
- `column: string`
- `label?: string`
- `checked: boolean`
- `color: string`
- `disabled?: boolean`
- `adaptiveTarget?: boolean`
- `title?: string`
- `onToggle: (checked: boolean, column: string) => void`
- `onColorInput?: (color: string, column: string) => void`
- `onMenuClick?: (column: string) => void`
- `menuLabel?: string`

## SeriesChipListOptions
- `container: HTMLElement`
- `items: SeriesChipListItem[]`
- `chipClass?: string`
- `onColorUpdate?: (column: string, color: string) => void`

---
[1]: ./composites/SeriesChip.md