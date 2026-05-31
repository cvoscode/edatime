# ai/frontend/src/ui/composites/ColumnFilterModal.md
> Renders a modal dialog for entering min/max filter bounds on a single column.

## Interface: ColumnFilterModalProps
```typescript
interface ColumnFilterModalProps {
    column: string;
    from: string;
    to: string;
    onApply: (from: string, to: string) => void;
    onCancel?: () => void;
}
```

## Function: ColumnFilterModal
```typescript
function ColumnFilterModal(props: ColumnFilterModalProps): HTMLDivElement
```
Creates a ModalFrame with two TextInputs (min/max) and Apply/Cancel buttons; calls `onApply` with the entered strings.

---
[1]: primitives/Button.md
[2]: primitives/TextInput.md
[3]: ModalFrame.md
[4]: index.md
  - Creates a filter modal with from/to inputs and apply/cancel actions.

## ColumnFilterModalProps
- `column: string`
- `from: string`
- `to: string`
- `onApply: (from: string, to: string) => void`
- `onCancel?: () => void`