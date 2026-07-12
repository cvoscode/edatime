# ai/frontend/src/pages/timeseriesHelp.test.md
> Vitest coverage for `initTimeseriesHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings and shortcuts on click.

## Test cases
- `ships a real <button> with id "timeseries-help-btn" inside #page-timeseries`
- `initTimeseriesHelp binds the button and opens the modal on click`
- `initTimeseriesHelp is safe to call twice (idempotent)`

---
[1]: ./timeseriesHelp.md