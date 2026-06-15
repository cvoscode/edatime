# ai/frontend/src/scatter/correlationsPanel.md
> Renders the list of correlation suggestion buttons in the scatter panel and triggers correlation refreshes.

## Imports
- `fetchScatterCorrelations` from [../services/api/index.js](../services/api/index.md)
- `appState` from [../store/index.js](../store/index.md)
- `updateCorrelationStats`, `updateColorbarUI` from [./rendering.js](./rendering.md)

## Functions
- `renderSuggestions(suggestions: CorrelationSuggestion[]): void`
  - Renders suggestion buttons with shape `{ x, y, correlation }`. Sets `.active` on the button whose `(x, y)` matches the current X/Y dropdowns. Clicking a button applies the pair to both `scatter-x-col` and `scatter-y-col`, then refreshes the correlation stats and re-renders the suggestion list.
- `refreshCorrelationsAndSuggestions(): Promise<void>`
  - Fetches correlations for the current X column, populates `appState.scatter.correlationsByColumn` and `lastSuggestions`, then calls `renderSuggestions`. Returns gracefully when the page is not visible.

---
[1]: ../types.md#CorrelationSuggestion
