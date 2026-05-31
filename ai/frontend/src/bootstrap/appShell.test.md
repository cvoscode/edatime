# bootstrap/appShell.md

> Bootstrap module that registers global keyboard shortcuts, command palette entries, and session import/export handlers for the app shell.

## Functions

- `registerAppCommands(deps: AppCommandDeps): void`
  - Registers command palette entries for navigation (heatmap, scatter, upload, settings), chart controls (zoom-out, reset-zoom), export (CSV filtered data), and session save/load.
- `initKeyboardShortcuts(deps: AppCommandDeps, definitions: CommandDefinition[]): void`
  - Attaches keyboard event listeners for each command definition; handles global shortcuts and per-page shortcuts.

## AppCommandDeps Interface

- `showPage(pageName: string): void`
- `zoomOut(): void`
- `resetZoom(): void`

## CommandDefinition Structure

- `id: string` — unique command identifier
- `keys?: string[]` — keyboard accelerator(s)
- `action: () => void` — command handler

---
[1]: ../app/shell.md
[2]: ../ui/palette.md
[3]: ../utils/session.md