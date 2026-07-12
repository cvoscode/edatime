# ai/frontend/src/pages/driftHelp.test.md
> Vitest coverage for `initDriftHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "drift-help-btn" inside #page-drift`
- `initDriftHelp binds the button and opens the modal on click`
- `initDriftHelp is safe to call twice (idempotent)`

---
[1]: ./driftHelp.md