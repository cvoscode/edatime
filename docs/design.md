# UI Design — edatime

This document defines the UI design language and patterns for edatime's user interface. It focuses on the visual system, component behavior, interaction patterns, and accessibility standards used across the Upload, Timeseries, and Scatter workflows.

## Design Goals

- Make charts and data actions the visual priority: interface chrome should be supportive, not dominant.
- Reduce cognitive load: show the minimum controls required for exploration and reveal advanced options progressively.
- Support fast, direct manipulation: interactions should be immediate, reversible, and keyboard-accessible.
- Be consistent and predictable: shared controls, chip behavior, and filter propagation must follow a single rule set.

## Layout & Structure

- Persistent left sidebar for primary navigation (Upload, Timeseries, Scatter, Matrix, Analysis). Keep icons compact and labels optional on narrow screens.
- Top bar: global search, dataset name, and runtime status. Keep action density low — export and dataset actions live in a single, context-aware menu.
- Main canvas: charts occupy the majority of horizontal space. Side panels and toolbars overlay or dock depending on available width.

## Component System

- Series Chips: compact rectangular chips with label, color swatch, and small menu affordance. Click toggles visibility; Ctrl+click sets adaptive filter target; double-right-click opens numeric filter.
- Toolbar: left-aligned, icon-first toolbar with inline state (active tool highlighted). Group related actions and keep popovers anchored to buttons.
- Panels: Use collapsible, resizable panels for Upload preview, column profile, and scatter controls; persist panel widths in local state.
- Modals & Dialogs: use confirmation modals for destructive actions (replace dataset), and lightweight drawers for multi-step operations (upload preview → ingest).

## Charts & Visualizations

- Primary chart area supports multiple overlaid series with per-series color, stroke weight, and simple point highlighting on hover.
- Tooltip: contextual, pinned tooltip for hovered points showing timestamp and series values; provide a keyboard-focusable alternative for accessibility.
- Legend & colorbars: compact legend for series; when color-by is enabled, show a mini colorbar with numeric ticks and a label.
- Density/Hexbin: switchable rendering mode for scatter to toggle between points and density; animate transitions to avoid jarring changes.

## Interaction Patterns

- Zoom & Pan: scroll or drag to zoom; click-drag pan with modifier. Maintain a zoom history stack for quick undo (back/forward buttons).
- Selection & Linking: selection in Timeseries sets the default query window for Scatter; selection gestures are additive with Shift and exclusive with Alt.
- Adaptive Filters: drawn with Ctrl+click pairs; display small handle markers and a clear affordance to remove filters. Keep filters local until explicitly saved.
- Keyboard Shortcuts: expose and document core shortcuts (`Alt+1..9`, `Shift+R`, modifier-click interactions). Offer an in-app help overlay listing shortcuts.

## Visual System

- Color
	- Default dark theme with a neutral background and high-contrast axes and labels.
	- Series colors chosen from a stable palette tuned for perceptual discrimination and colorblind safety.
	- Use saturation/value adjustments to indicate disabled/hidden series.
- Typography
	- System stack for performance; size tokens: 12px (compact), 14px (body), 16–18px (headings).
	- Use numeric and monospace styles for time/axis labels where helpful.
- Spacing & Grids
	- Use an 8px spacing baseline. Small controls (chips) are 8–12px tall; panels align to an 8px grid.

## Accessibility

- Keyboard focus: all interactive elements must be reachable via Tab and show visible focus rings.
- Screen reader labels: series chips, export actions, and chart controls must expose ARIA labels and roles.
- Contrast: ensure text and critical UI elements meet WCAG AA contrast ratios against the background.
- Reduced motion: honor prefers-reduced-motion and simplify transitions when set.

## Responsiveness & Mobile

- Prioritize core actions on small screens: upload, select series, and view a single chart. Secondary controls collapse into a bottom sheet or overflow menu.
- Touch gestures: pinch-to-zoom and two-finger pan; long-press to open context menus on touch devices.

## Theming & Tokens

- Expose design tokens for colors, spacing, type, and elevation in `css/variables.css` or a small token map for the frontend build.
- Theme toggles: provide dark theme as default; keep a light theme option with the same token set inverted where appropriate.

## Motion & Microinteractions

- Use short, subtle transitions (80–160ms) for hover/focus states; use slightly longer transitions (200–350ms) when changing chart rendering mode.
- Microinteractions should provide feedback for state changes (series toggled, filter applied, export started) with small toasts or in-toolbar status.

## Error States & Empty States

- Preview empty state: show a clear upload hint with supported file formats and a small example CSV snippet.
- Chart error state: show a compact message with suggested fixes (adjust time range, remove filters) and a retry control.

## Implementation Notes

- Keep runtime-driven style changes (series colors, visible columns) local to frontend state and avoid round-trip re-renders where possible.
- Persist non-sensitive UI preferences (panel sizes, last-selected palette) to local storage to improve continuity between sessions.

## Example tokens (suggested)

- `--space-1: 4px; --space-2: 8px; --space-3: 16px;`
- `--font-size-body: 14px; --font-size-small: 12px; --font-family-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;`

## How to use this file

- Use this document as the single-source UI guidance for frontend changes and design reviews.
- When adding or changing components, update the visual tokens and add a short entry here describing behavioral changes.

---

Last updated: 2026-05-11
