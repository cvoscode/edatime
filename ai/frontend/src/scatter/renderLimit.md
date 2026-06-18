# ai/frontend/src/scatter/renderLimit.md
> Size-based scatter request limit helper used by live scatter rendering.

## Constants
- `MIN_INTERACTIVE_SCATTER_POINTS = 25_000`
- `MAX_INTERACTIVE_SCATTER_POINTS = 200_000`
- `POINTS_PER_PIXEL = 0.25`

## Functions
- `computeInteractiveScatterLimit(container: HTMLElement | null, options?: { devicePixelRatio?: number; minPoints?: number; maxPoints?: number }): number`
  - Derives a point limit from the container size and device pixel ratio, clamping it between the configured min/max bounds.
