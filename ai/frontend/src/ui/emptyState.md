# frontend/src/ui/emptyState.ts
> Empty state display view model and controller factory.

## Interfaces
- `EmptyStateViewModel`: `{ visible, reason, title, message, showResetAction?, showClearAction?, fallbackText? }`
- `EmptyStateControllerOptions`: `{ rootId, titleId?, messageId?, resetButtonId?, clearButtonId?, resetEventName?, clearEventName?, eventSource? }`
- `EmptyStateController`: `{ update(model: EmptyStateViewModel): void }`

## Functions
- `createEmptyStateController(options: EmptyStateControllerOptions): EmptyStateController`
  - Factory that creates an empty state controller bound to DOM elements.
- `isRangeOutsideDataset(timeRange, start, end): boolean`
  - Checks if a time range falls outside the dataset bounds.
