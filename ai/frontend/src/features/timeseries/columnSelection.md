# features/timeseries/columnSelection.md
> Selected-column sanitization and adaptive-target fallback. Extracted from columnsController to keep chip-list builder focused on presentation and event wiring.

## Functions

### sanitizeSelectedColumns
- `sanitizeSelectedColumns(): void`
  - Removes blocked names (ts, timestamp, time), datetime columns, and non-existent columns from the current selection.

### ensureAdaptiveTargetStillValid
- `ensureAdaptiveTargetStillValid(): void`
  - Falls back to first selected column if current adaptive-filter target is no longer selected.

---
[1]: ../../store/index.md