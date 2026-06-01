# features/timeseries/chipContextMenu.md
> Double-right-click a chip to open its column filter modal. Extracted so the interaction rule stays isolated.

## State
- `_lastContextTs: number`
- `_lastContextCol: string`

## Functions
- `bindChipContextMenu(container: HTMLElement): void`
  - Attaches contextmenu listener; deduplicates double-context on same column within 450ms; calls `window.__edatime?.openFilterForCol`.

---
[1]: ./columnsController.md
