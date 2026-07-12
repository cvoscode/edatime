# ai/frontend/src/pages/scatterHelp.md
> Page-level "?" help content for the Scatter page. Wired from `initScatterPage` via `initScatterHelp` after `scatterState.initialized` is set.

## Constants
- `SCATTER_HELP: PageHelpContent`
  - Sections: "View toolbar", "Display segment", "Linked filters and color", "Plot interactions", "Export", "How the help button works".
  - Shortcuts include `⌥3`, `⌥4`, `⌥7`, `?`, `P`, `E`, `Ctrl+K`.
  - Tips cover Density default above 50k points, categorical color encoding, narrow-filter troubleshooting, and save-session behavior.

## Functions
- `initScatterHelp(): void`
  - Calls `initPageHelp('scatter', SCATTER_HELP)`.

---
[1]: ../ui/pageHelp.md
[2]: ../scatter/scatterPage.md