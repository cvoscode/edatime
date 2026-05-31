# ai/frontend/src/causal/causalComparison.md
> Causal run comparison — saves causal runs with parameters and edge sets, computes diffs between runs (added/removed/changed edges).

## Types
- `CausalLink` — `{ source: string; target: string; lag: number; type: string; value: number; pvalue: number }`
- `SavedCausalRun` — `{ id: string; label: string; timestamp: number; method: string; test: string; tauMax: number; alpha: number; columns: string[]; links: CausalLink[] }`

## Functions
- `loadSavedRuns(): SavedCausalRun[]` — Loads saved runs from localStorage.
- `saveRun(links: CausalLink[], columns: string[], params: { method: string; test: string; tauMax: number; alpha: number }, label?: string): SavedCausalRun` — Saves a new causal run (newest first; capped at 20).
- `deleteRun(id: string): void` — Deletes a run by ID.
- `clearAllRuns(): void` — Removes all saved runs.
- `initCausalComparison(): void` — Initialises the comparison UI and load/save handlers.

---
[1]: ../services/api/index.md#fetchCausalGraph
[2]: ../ui/composites/SeriesChip.md#SeriesChip
[3]: ../ui/index.md#renderSeriesChipList
