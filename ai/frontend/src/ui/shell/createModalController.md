# ai/frontend/src/ui/shell/createModalController.md
> Factory that creates a modal controller managing visibility and close button bindings.

## Function: createModalController
```typescript
function createModalController(opts: {
    modalId: string;
    closeButtonIds: string[];
    onOpen?: () => void;
    onClose?: () => void;
}): {
    open: () => void;
    close: () => void;
}
```
Creates a controller that shows/hides the modal by id, binds close buttons, and closes on backdrop click.

---
[1]: index.md
  - Creates a controller managing modal visibility and keyboard events.

## ModalControllerOptions
- `modalId: string`
- `closeButtonId?: string`
- `onClose?: () => void`

## ModalController
- `open(): void`
- `close(): void`
- `toggle(): void`