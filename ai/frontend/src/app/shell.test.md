# frontend/src/app/shell.test.md
> Tests for application shell bootstrap initialization. Verifies the shell's eager `core` init, that subsystems are NOT eagerly loaded, and that `window.__edatime.ensureSubsystem` is installed.

## Test Suite: shell bootstrap

### it initializes global shell services without owning feature-specific behavior
- `initAppShell(deps: AppShellDeps): void`
  - Verifies that `initAppShell` runs the eager `core` init (form controls, page routing, settings, theme, accessibility shortcuts, home cards) and installs `window.__edatime.ensureSubsystem`. Does NOT eagerly load upload/analytics/commands subsystems.

### it exposes ensureSubsystem as a function
- `(window as any).__edatime.ensureSubsystem`
  - Verifies the bridge is `typeof 'function'`.

### it loads subsystems on first ensureSubsystem call
- `ensureSubsystem('upload-panel')`, `ensureSubsystem('analytics-overlay')`, etc.
  - Verifies that calling `ensureSubsystem(name)` triggers the corresponding `registerSubsystem` loader and is idempotent across repeat calls.
