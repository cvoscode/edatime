# ai/frontend/src/scatter/correlationsPanel.md
> Renders the list of correlation suggestion buttons in the scatter panel and triggers correlation refreshes.

## Imports
- `fetchScatterCorrelations` from [../services/api/index.js](../services/api/index.md)
- `appState` from [../store/index.js](../store/index.md)
- `getDropdownValue`, `setDropdownOptions`, `setDropdownValue` from [../ui/primitives/Dropdown.js](../ui/primitives/Dropdown.md)
- `updateCorrelationStats`, `updateColorbarUI` from [./rendering.js](./rendering.md)
- `ensureOptions` from [./state.js](./state.md)

## Types
- `SuggestionApplyHandler = (x: string, y: string) => void | Promise<void>` — invoked after a pill is clicked and the dropdowns are updated. The scatter page uses this to re-fetch correlations and re-render the chart.

## Module-Scoped State
- `activeApplyHandler: SuggestionApplyHandler | null` — most recently registered handler. `setSuggestionApplyHandler` rewrites it; `renderSuggestions` always invokes the latest reference so re-rendered buttons stay wired.

## Functions
- `setSuggestionApplyHandler(handler: SuggestionApplyHandler | null): void`
  - Registers (or clears) the click handler for correlation pills. The scatter page calls this once during init so subsequent `renderSuggestions` invocations keep the click → re-render wiring intact.
- `renderSuggestions(suggestions: CorrelationSuggestion[]): void`
  - Renders suggestion buttons with shape `{ x, y, correlation }`. Sets `.active` on the button whose `(x, y)` matches the current X/Y dropdowns. Clicking a button updates `scatter-x-col` and `scatter-y-col`, refreshes `appState.scatter.lastSuggestions`, then fires the registered `activeApplyHandler`. Re-clicking the active pair is a no-op.
- `refreshCorrelationsAndSuggestions(): Promise<void>`
  - Fetches correlations for the current X column, populates `appState.scatter.correlationsByColumn` and `lastSuggestions`, then calls `renderSuggestions`. Skips the dropdown rebuild when there are fewer than two numeric columns. Also rebuilds the color-column dropdown so newly-ingested columns appear immediately.
- `openScatterPairInCausal(): void`
  - Dispatches `edatime:causal-preselect` with the current X/Y columns and clicks the causal sidebar nav item. Replaces the inline handler previously hosted in [controls.ts][1].

---
[1]: ./controls.md
[2]: ../types.md#CorrelationSuggestion
