# ai/frontend/src/pages/heatmapHelp.md
> Page-level "?" help content for the Correlations (heatmap) page. The DOM id is `heatmap-help-btn` (matches `#page-heatmap`), but `pageName` displays as "Correlations".

## Constants
- `HEATMAP_HELP: PageHelpContent`
  - Sections: "Metric toolbar", "Display segment", "Matrix interactions", "Export", "How the help button works".
  - Shortcuts include `⌥7`, `⌥3`, `?`, `Ctrl+K`.

## Functions
- `initHeatmapHelp(): void`
  - Calls `initPageHelp('heatmap', HEATMAP_HELP)`.

---
[1]: ../ui/pageHelp.md