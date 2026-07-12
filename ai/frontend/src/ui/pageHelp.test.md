# ai/frontend/src/ui/pageHelp.test.md
> Vitest happy-dom coverage for the shared `initPageHelp` helper. Asserts trigger binding, modal open/close, focus restore, idempotency, backdrop-vs-body click discrimination, HTML escaping, and missing-trigger no-op behavior.

## Test cases (inside `describe('initPageHelp')`)
- `binds the trigger button and is idempotent on repeated calls`
- `opens the modal with the expected content on click`
- `closes when the close button is clicked`
- `closes on Escape`
- `closes when the backdrop is clicked but not when the dialog body is clicked`
- `removes a previous instance when the trigger is clicked twice`
- `escapes HTML in user-provided copy to prevent injection`
- `does nothing when the trigger button is missing`
- `restores focus to the trigger on close`

## Helpers
- `countOpenListeners(): number`
  - Synthesizes a click on the test trigger and counts `#page-help-modal` instances to verify re-init does not stack listeners.

---
[1]: ./pageHelp.md