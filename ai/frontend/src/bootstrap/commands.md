# ai/frontend/src/bootstrap/commands.md
> CLI-like command registration and execution for the command palette.

## Functions
- `buildPaletteCommands(deps: CommandDeps): PaletteCommand[]`
  - Map APP_COMMAND_DEFINITIONS to PaletteCommand format for the command palette.
- `registerAppCommands(deps: CommandDeps): void`
  - Register all app commands with the command palette.

## Interfaces
- `CommandDeps`
  - `showPage: (pageName: string) => void`
  - `zoomOut: () => void`
  - `resetZoom: () => void`

- `CommandDefinition`
  - `id: string`
  - `label: string`
  - `shortcut?: string`
  - `category: PaletteCommand['category']`
  - `action: (deps: CommandDeps) => void`
  - `keyboard?: { key: string; alt?: boolean; shift?: boolean; page?: string }`
