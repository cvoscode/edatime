# ai/frontend/src/pages/fftHelp.test.md
> Vitest coverage for `initFftHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "fft-help-btn" inside #page-fft`
- `initFftHelp binds the button and opens the modal on click`
- `initFftHelp is safe to call twice (idempotent)`

---
[1]: ./fftHelp.md