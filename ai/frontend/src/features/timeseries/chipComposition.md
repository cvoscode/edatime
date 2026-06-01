# features/timeseries/chipComposition.ts
> Transforms appState into `SeriesChipListItem[]` for renderSeriesChipList. Encapsulates state→item mapping so callers don't need to know store shape details.

## Interface: ChipCompositionOptions
```typescript
interface ChipCompositionOptions {
    filterText: string;
    renderCurrentDataFn: (() => void) | null;
    buildRangeControlsFn: () => void;
    fetchAndRender: () => void;
}
```

## Interface: ChipListItem
```typescript
interface ChipListItem {
    column: string;
    checked: boolean;
    color: string;
    adaptiveTarget: boolean;
    title: string;
    onToggle: (checked: boolean) => void;
    onColorInput: (nextColor: string) => void;
    onMenuClick: () => void;
    menuLabel: string;
}
```

## Functions
- `composeChipListItems(options: ChipCompositionOptions): ChipListItem[]`
  - Maps visible numeric columns to chip items with toggle/color/menu handlers.

- `bindChipCtrlClick(container: HTMLElement, rebuildAndRender: () => void, buildRangeControlsFn: () => void, renderCurrentDataFn: (() => void) | null, fetchAndRender: () => void): void`
  - Attaches Ctrl+click listener to `.series-chip` elements for adaptive-filter targeting (capture phase).

---
[1]: ../../store/index.md
[2]: ./columnSelection.md
