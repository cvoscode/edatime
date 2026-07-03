# ai/frontend/src/scatter/correlationsPanel.test.md
> Unit tests for `refreshCorrelationsAndSuggestions` and `renderSuggestions`.

## Tests
- `refreshCorrelationsAndSuggestions` — fetches correlations, populates X/Y selects and color-column select, builds `correlationsByColumn`, calls `renderSuggestions`. On first load with no user pair biases to `top_pairs[0]`.
- `renderSuggestions` — renders empty state when no suggestions; renders fallback top pair button when below threshold; renders one button per suggestion; sets `.active` on button matching current X/Y; clicking fires `activeApplyHandler` and re-renders.
