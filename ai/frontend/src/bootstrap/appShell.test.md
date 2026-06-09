# bootstrap/appShell.test.md

> Tests for the legacy appShell bootstrap. The current shell has been split into `app/shell/core` (eager) and `app/shell/deferredSubsystems` (lazy), so the tests focus on `registerAppCommands` and the subsystems registry.

## Test Suite: appShell bootstrap

### it registers app commands
- `registerAppCommands(deps: CommandDeps): Promise<void>`
  - Verifies that `registerAppCommands` dynamically imports the palette module and calls `registerCommands(buildPaletteCommands(deps))`.

### it triggers deferred subsystem loaders
- `ensureSubsystem('commands' | 'settings' | 'timeseries-shell' | ...)`
  - Verifies that the `app-commands` subsystem wires `registerAppCommands` to the `registerCommands` palette API.
