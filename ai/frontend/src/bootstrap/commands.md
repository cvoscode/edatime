# frontend/src/bootstrap/commands.ts
> Command palette definitions — all navigation, chart, export, session, and analysis commands.

## Interface: CommandDeps
```typescript
interface CommandDeps {
    showPage: (pageName: string) => void;
    zoomOut: () => void;
    resetZoom: () => void;
}
```

## Interface: CommandDefinition
```typescript
interface CommandDefinition {
    id: string;
    label: string;
    shortcut?: string;
    category: PaletteCommand['category'];
    action: (deps: CommandDeps) => void;
    keyboard?: { key: string; alt?: boolean; shift?: boolean; page?: string };
}
```

## Constants

### APP_COMMAND_DEFINITIONS
- `APP_COMMAND_DEFINITIONS: ReadonlyArray<CommandDefinition>`
  - All command definitions including navigation (Alt+1-9,0), chart controls (Shift+R/Z/C), exports (CSV/JSON/PNG/Parquet), session (save/load), and analysis commands.

## Functions

### exportChartFilteredData
- `exportChartFilteredData(format: 'csv' | 'json'): void`
  - Triggers chart data export via `window.__edatime.exportChartFilteredData`.

### triggerAdaptiveFilterClear
- `triggerAdaptiveFilterClear(): void`
  - Clicks the `#adaptive-clear-btn` element.

### buildPaletteCommands
- `buildPaletteCommands(deps: CommandDeps): PaletteCommand[]`
  - Maps `APP_COMMAND_DEFINITIONS` to `PaletteCommand` shape for the palette registry.

### registerAppCommands
- `registerAppCommands(deps: CommandDeps): void`
  - Registers all commands with the palette system.

---
[1]: ../utils/palette.md
