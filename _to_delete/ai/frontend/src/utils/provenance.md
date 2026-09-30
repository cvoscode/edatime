# ai/frontend/src/utils/provenance.md

> Provenance panel that displays the current analysis context: dataset info, time range, filters, color encoding, and analytics overlays.

## Functions
- `toggleProvenance(): void`
  - Shows or hides the provenance panel.
- `refreshProvenance(): void`
  - Re-renders panel content if the panel is currently visible.
- `initProvenance(): void`
  - Builds the panel DOM, binds the toggle button (header), and registers Ctrl+I shortcut and state-change listeners.