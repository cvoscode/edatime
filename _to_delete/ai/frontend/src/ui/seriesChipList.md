# ai/frontend/src/ui/seriesChipList.md
> Renders shared series chips, preserves optional transient chip DOM state, and owns delegated keyboard and color-update plumbing for chip lists.

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

## Interface: SeriesChipListOptions
- `container: HTMLElement`
- `items: SeriesChipListItem[]`
- `chipClass?: string`
- `onColorUpdate?: (column: string, color: string) => void`
- `postChipAttributes?: Record<string, string>`
- `postChipClass?: (item: SeriesChipListItem) => string`
- `preserveExisting?: boolean`

## Interface: ChipExtras
- `postChipAttributes?: Record<string, string>`
- `postChipClass?: (item: SeriesChipListItem) => string`

## Functions
- `ensureChipKeyboardBinding(container: HTMLElement): void`
  - Installs the delegated chip keyboard handler at most once per container.
- `applyChipExtras(chip: HTMLElement, item: SeriesChipListItem, extras: ChipExtras): void`
  - Applies shared post-render attributes and conditional classes to a chip.
- `renderSeriesChipList(options: SeriesChipListOptions): void` [deps: [SeriesChip][1]]
  - Renders or preserves a chip list, depending on `preserveExisting`.
- `updateSeriesChipList(options: SeriesChipListOptions): void` [deps: [SeriesChip][1]]
  - Incrementally upserts chips by `data-col` and updates checked state and accent color in place.
- `bindSeriesChipKeyboard(container: HTMLElement): () => void`
  - Binds Enter/Space toggling for chips and returns an unbind callback.

---
[1]: ./composites/SeriesChip.md#SeriesChip
