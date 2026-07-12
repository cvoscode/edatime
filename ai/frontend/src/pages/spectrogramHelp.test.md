# ai/frontend/src/pages/spectrogramHelp.test.md
> Vitest coverage for `initSpectrogramHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "spectrogram-help-btn" inside #page-spectrogram`
- `initSpectrogramHelp binds the button and opens the modal on click`
- `initSpectrogramHelp is safe to call twice (idempotent)`

---
[1]: ./spectrogramHelp.md