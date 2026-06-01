# features/timeseries/seriesCollapse.md
> Manages collapsed/expanded state of the series chip list and applies visual collapse threshold.

## State
- `_seriesCollapsed: boolean` — toggle state

## Functions
- `initSeriesCollapse(): void`
  - Attaches click handler to `#collapse-series-btn`.
- `updateCollapseButton(btn: HTMLElement): void`
  - Updates button title, aria-label, and SVG rotation.
- `applyCollapse(): void`
  - Hides chips beyond collapse threshold (3) when collapsed; manages `#series-collapse-badge`.

---
[1]: ./columnsController.md
