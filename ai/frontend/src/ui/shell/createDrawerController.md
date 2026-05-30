# frontend/src/ui/shell/createDrawerController.ts
> Drawer open/close/toggle controller with button bindings.

## Function: createDrawerController
- `createDrawerController(opts: DrawerControllerOptions): DrawerController`
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