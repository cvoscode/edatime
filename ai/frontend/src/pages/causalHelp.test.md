# ai/frontend/src/pages/causalHelp.test.md
> Vitest coverage for `initCausalHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "causal-help-btn" inside #page-causal`
- `initCausalHelp binds the button and opens the modal on click`
- `initCausalHelp is safe to call twice (idempotent)`

---
[1]: ./causalHelp.md