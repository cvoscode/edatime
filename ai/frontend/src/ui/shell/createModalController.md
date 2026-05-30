# frontend/src/ui/shell/createModalController.ts
> Modal open/close controller with escape key handling.

## Function: createModalController
- `createModalController(opts: ModalControllerOptions): ModalController`
  - Creates a controller managing modal visibility and keyboard events.

## ModalControllerOptions
- `modalId: string`
- `closeButtonId?: string`
- `onClose?: () => void`

## ModalController
- `open(): void`
- `close(): void`
- `toggle(): void`