# ai/frontend/src/pages/scatterHelp.test.md
> Vitest coverage for `initScatterHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "scatter-help-btn" inside #page-scatter`
- `initScatterHelp binds the button and opens the modal on click`
- `initScatterHelp is safe to call twice (idempotent)`

---
[1]: ./scatterHelp.md