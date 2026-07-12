# ai/frontend/src/pages/heatmapHelp.test.md
> Vitest coverage for `initHeatmapHelp`. Asserts the trigger button is present in `frontend/index.html` and that the modal renders the expected section headings on click.

## Test cases
- `ships a real <button> with id "heatmap-help-btn" inside #page-heatmap`
- `initHeatmapHelp binds the button and opens the modal on click`
- `initHeatmapHelp is safe to call twice (idempotent)`

---
[1]: ./heatmapHelp.md