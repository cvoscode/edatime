# frontend/src/ui/seriesChipList.ts
> Shared SeriesChip list orchestration — renders chips into a container, wires keyboard activation, and manages color updates.

## Interface: SeriesChipListOptions
- `container: HTMLElement`
- `items: SeriesChipListItem[]`
- `chipClass?: string`
- `onColorUpdate?: (column: string, color: string) => void`
- `postChipAttributes?: Record<string, string>`
- `postChipClass?: (item: SeriesChipListItem) => string`

## Interface: SeriesChipListItem
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

## Functions
- `renderSeriesChipList(options: SeriesChipListOptions): void`
  - Renders items into container, adds `chipClass`, wires delegated keyboard handler, stores cleanup.
- `updateSeriesChipList(options: SeriesChipListOptions): void`
  - Incremental DOM update: upserts/removes chips by `data-col` without full rebuild.
- `bindSeriesChipKeyboard(container: HTMLElement): () => void`
  - Delegated keydown handler (Enter/Space toggles checkbox); returns cleanup function.

---
[1]: ./composites/SeriesChip.md