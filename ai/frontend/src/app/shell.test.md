# frontend/src/app/shell.test.md
> Tests for application shell bootstrap initialization.

## Test Suite: shell bootstrap

### it initializes global shell services without owning feature-specific behavior
- `initAppShell(deps: AppShellDeps): void`
  - Verifies that initAppShell calls initAnalyticsListeners exactly once.