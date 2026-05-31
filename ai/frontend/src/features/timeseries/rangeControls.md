# features/timeseries/rangeControls.md
> Range filter chip rendering. Builds clickable range chips shown below the column-toggles strip; each chip opens the column-filter modal for that column.

## Functions

### buildRangeControls
- `buildRangeControls(): void`
  - Renders adaptive-target chip, per-column range chips, and active adaptive line-filter chips. Each chip is keyboard-accessible and opens the filter modal via `window.__edatime?.openFilterForCol`.

---
[1]: ../../utils/format.md#formatAnalysisNumber
[2]: ../../store/index.md