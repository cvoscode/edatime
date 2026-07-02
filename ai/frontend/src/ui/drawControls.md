# ai/frontend/src/ui/drawControls.md
> Drawing-tool toolbar bindings, adaptive-filter clearing, and inline help affordances.

## Functions
- `initDrawControls(fetchAndRender: () => void): void`
  - Wires draw mode/color/width controls, zoom reset, adaptive-filter clear, and the Draw `?` help button. The help button can restore the dismissed adaptive-filter hint before opening keyboard-shortcut help.
