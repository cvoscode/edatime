# ai/frontend/src/pages/homePage.test.md
> Vitest coverage for `initHomePage`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "home-help-btn" inside #page-home`
- `initHomePage binds the button and opens the modal on click`
- `initHomePage is safe to call twice (idempotent)`

---
[1]: ./homePage.md