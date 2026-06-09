# ai/frontend/src/app/shell/core.md
> Eager shell bootstrap. Always-on setup required for the application shell to render: form-control accessibility, page routing, settings, theme, accessibility shortcuts, and home navigation cards. Runs before any deferred subsystem loads. Heavy UI subsystems (upload, analytics, annotations, guided workflow, transform / outlier modals, provenance) live in `deferredSubsystems` and are pulled in lazily.

## Interface: ShellCoreInitDeps
- `showPage: (pageName: string) => void`

## Functions

### initShellCore
- `initShellCore(deps: ShellCoreInitDeps): void`
  - Idempotent — safe to call more than once. Runs `normalizeFormControlAccessibility`, `initPages`, `initHashRouting`, `initSettings`, `initThemeToggle`, `initAccessibilityShortcuts`, and `initKeyboardHelpButton`. Applies `sidebar-collapsed` class to `.app-layout` if the `sidebarCollapsed` setting is true. Wires home navigation cards via `wireHomeNavigationCards(deps.showPage)`. Heavy subsystems are NOT touched here — see [deferredSubsystems][1].

### initKeyboardHelpButton
- `initKeyboardHelpButton(): void`
  - Wires `#keyboard-help-btn` to call `showKeyboardShortcutsHelp` on click.

---
[1]: ./deferredSubsystems.md
[2]: ./a11yNormalization.md#normalizeFormControlAccessibility
[3]: ./themeToggle.md#initThemeToggle
[4]: ./homeNavigation.md#wireHomeNavigationCards
[5]: ../../utils/a11y.md#initAccessibilityShortcuts
[6]: ../../utils/router.md#initHashRouting
[7]: ../../ui/toolbar.md#initPages
[8]: ../../utils/settings.md#initSettings
