# frontend/src/ui/composites/ColumnFilterModal.ts
> Modal for filtering a column by min/max range.

## Function: ColumnFilterModal
- `ColumnFilterModal(props: ColumnFilterModalProps): HTMLDivElement`
  - Creates a filter modal with from/to inputs and apply/cancel actions.

## ColumnFilterModalProps
- `column: string`
- `from: string`
- `to: string`
- `onApply: (from: string, to: string) => void`
- `onCancel?: () => void`