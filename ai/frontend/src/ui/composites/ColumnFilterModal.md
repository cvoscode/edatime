# ai/frontend/src/ui/composites/ColumnFilterModal.md
> Renders a modal dialog for entering min/max filter bounds on a column, or wires an existing server-rendered modal via bind mode.

## Interface: ColumnFilterModalBind
```typescript
interface ColumnFilterModalBind {
    root: HTMLElement;
    applyBtn: HTMLButtonElement;
    cancelBtn: HTMLElement;
    closeBtn: HTMLElement;
    minInput: HTMLInputElement;
    maxInput: HTMLInputElement;
    minRangeInput: HTMLInputElement;
    maxRangeInput: HTMLInputElement;
}
```

## Interface: ColumnFilterModalProps
```typescript
interface ColumnFilterModalProps {
    bind?: ColumnFilterModalBind;
    column?: string;
    from?: string;
    to?: string;
    onApply: (from: string, to: string) => void;
    onCancel?: () => void;
}
```

## Function: ColumnFilterModal
```typescript
function ColumnFilterModal(props: ColumnFilterModalProps): HTMLElement
```
In bind mode: wires existing DOM elements to apply/cancel/close/Escape/backdrop events. In create mode: builds new ModalFrame with TextInputs and Apply/Cancel buttons.

---
[1]: primitives/Button.md
[2]: primitives/TextInput.md
[3]: ModalFrame.md

## ColumnFilterModalProps
- `bind?: ColumnFilterModalBind` — wire existing DOM (preserves server-rendered IDs)
- `column?: string` — create mode only
- `from?: string` — create mode only
- `to?: string` — create mode only
- `onApply: (from: string, to: string) => void`
- `onCancel?: () => void`
