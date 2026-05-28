# frontend/src/ui/modalUtils.ts
> Shared modal close handler utilities.

## Functions
- `initModalClose(modalId: string, closeBtnId: string, cancelBtnId: string, onClose?: () => void): (() => void) | null`
  - Initializes modal close handlers for button clicks and backdrop clicks.
