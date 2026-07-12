# frontend/src/ui/settingsPanel.ts
> Tabbed settings modal for appearance, export, analytics, and workflow settings.

## Module-Scoped State
- `hasUnsavedChanges: boolean` — tracks whether any form control has been modified since modal open.

## Functions
- `openSettingsModal(): void`
  - Opens the settings modal and populates form. Resets `hasUnsavedChanges`.
- `closeSettingsModal(): void`
  - Closes the settings modal. Resets `hasUnsavedChanges`.
- `initSettingsPanel(): void` [deps: [initSettingsHelp][1]]
  - Initializes settings modal event handlers. Wires `markUnsavedChanges()` to all listed form controls. When any control changes, `syncApplyIndicator()` shows/hides `#settings-apply-indicator`. Also wires the page-level `?` help button via `initSettingsHelp`.
- `syncApplyIndicator(): void`
  - Shows/hides the `#settings-apply-indicator` dot based on `hasUnsavedChanges`.
- `markUnsavedChanges(): void`
  - Sets `hasUnsavedChanges = true` and calls `syncApplyIndicator()`.
- `clearUnsavedChanges(): void`
  - Sets `hasUnsavedChanges = false` and calls `syncApplyIndicator()`.

---
[1]: ./settingsHelp.md#initSettingsHelp
