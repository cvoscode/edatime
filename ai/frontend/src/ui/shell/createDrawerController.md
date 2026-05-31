# ai/frontend/src/ui/shell/createDrawerController.md
> Factory that creates a drawer controller managing open/close state, body class, and button bindings.

## Function: createDrawerController
```typescript
function createDrawerController(opts: {
    drawerId: string;
    toggleButtonIds: string[];
    onOpen?: () => void;
    onClose?: () => void;
}): {
    open: () => void;
    close: () => void;
    toggle: () => void;
    isOpen: () => boolean;
}
```
Creates a controller that shows/hides the drawer by id, toggles `.drawer-open` on `document.body`, binds toggle buttons, closes on backdrop click, and closes on Escape key.

---
[1]: index.md
  - Creates a controller managing drawer visibility and toggle button listeners.

## DrawerControllerOptions
- `drawerId: string`
- `toggleButtonIds: string[]`
- `onOpen?: () => void`
- `onClose?: () => void`

## DrawerController
- `open(): void`
- `close(): void`
- `toggle(): void`