# frontend/src/ui/analyticsDrawer.ts
> Right-side collapsible analytics panel, controlled by `createDrawerController`.

## Exports
- `initAnalyticsDrawer(): void`
- `openDrawer: () => void`
- `closeDrawer: () => void`
- `toggleDrawer: () => void`
- `controller: DrawerController`

## Controller
- `createDrawerController(opts: DrawerControllerOptions): DrawerController`
  - `drawerId: 'analytics-drawer'`
  - `toggleButtonIds: ['open-analytics-panel-btn']`
  - `onOpen` — calls `updateSetting('analyticsDrawerOpen', true)`
  - `onClose` — calls `updateSetting('analyticsDrawerOpen', false)`

## DrawerController
- `open(): void`
- `close(): void`
- `toggle(): void`
