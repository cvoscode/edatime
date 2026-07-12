# ai/frontend/src/ui/settingsHelp.test.md
> Vitest coverage for `initSettingsHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "settings-help-btn" inside #settings-modal`
- `initSettingsHelp binds the button and opens the modal on click`
- `initSettingsHelp is safe to call twice (idempotent)`

---
[1]: ./settingsHelp.md