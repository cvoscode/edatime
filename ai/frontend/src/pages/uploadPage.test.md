# ai/frontend/src/pages/uploadPage.test.md
> Vitest coverage for `initUploadHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "upload-help-btn" inside #page-upload`
- `initUploadHelp binds the button and opens the modal on click`
- `initUploadHelp is safe to call twice (idempotent)`

---
[1]: ./uploadPage.md