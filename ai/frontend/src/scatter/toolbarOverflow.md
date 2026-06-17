# ai/frontend/src/scatter/toolbarOverflow.md
> Per-segment overflow popout for the scatter toolbar. When a `.scatter-toolbar__segment` wraps onto multiple rows, the overflowing fields move into a `<details class="scatter-toolbar__overflow">` menu and the segment is flagged with `data-overflow="true"`.

## Constants
- `OVERFLOW_BTN_LABEL = 'More options'` — accessible name for the summary button.

## Internal Interfaces
```ts
interface SegmentInfo {
    segment: HTMLElement;
    fields: HTMLElement;
    overflow: HTMLElement;
    overflowMenu: HTMLElement;
    inlineChildren: HTMLElement[];
    popped: HTMLElement[];
}
```

## Module-Scoped State
- `segments: SegmentInfo[]` — registry of segments currently participating in overflow handling.
- `observer: ResizeObserver | null` — single ResizeObserver bound to the toolbar element.
- `scheduled: boolean` — animation-frame debounce flag for rebalance passes.

## Functions
- `initScatterToolbarOverflow(toolbar: HTMLElement): boolean` [deps: [ResizeObserver][1]]
  - Walks `.scatter-toolbar__segment` children, registers each one that hosts an overflow popout, and installs a single `ResizeObserver` on the toolbar to drive rebalancing. Falls back to a one-shot rebalance when `ResizeObserver` is unavailable. Idempotent — a second call after the registry is non-empty returns `true` without re-registering.
- `refreshScatterToolbarOverflow(): void`
  - Schedules a rebalance pass on the next animation frame. Called from [rendering.syncModeUI][2] after toggling density/color-scale fields so the overflow popout reflects the new field set.
- `closeScatterToolbarOverflow(): void`
  - Closes every open overflow `<details>` element. Use before a chart click to prevent the popout from intercepting the click.
- `_runScatterToolbarOverflowNowForTests(): void`
  - Test helper. Synchronously rebalances every registered segment, bypassing the rAF debounce.
- `_resetScatterToolbarOverflowForTests(): void`
  - Test helper. Disconnects the observer, restores any popped fields to their original parents, and clears the registry.

## Internal Helpers
- `restoreInlineOrder(info: SegmentInfo): void` — reinserts every original `inlineChildren` element before the overflow element so `offsetTop` measurements come from a single layout context.
- `rebalanceSegment(info: SegmentInfo): void` — moves any field whose `offsetTop` exceeds the first child's by more than 4 px into the popout; restores inline order otherwise. Updates the summary's `aria-label` / `title` to the hidden-option count.
- `registerSegment(segment: HTMLElement): boolean` — captures the static layout (overflow element, inline children in document order).
- `scheduleRebalance(): void` — collapses multiple observer ticks into a single rAF callback.

---
[1]: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
[2]: ./rendering.md#syncModeUI
