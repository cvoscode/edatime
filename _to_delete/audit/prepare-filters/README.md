# Preparation and filters audit

Date: 2026-09-05  
Surface: Data source → Signals → numeric range filter  
Dataset: local `ETTm2.csv`, 69,680-row preview

## Overall verdict

The flow is functional and technically well instrumented, but filter intent is split across two surfaces. Upload preview filtering searches profile columns, while actual data filtering is exposed through a small per-series icon and a modal. After applying a range, the resulting state is difficult to verify at a glance.

## Captured flow

1. **Upload preview — healthy** (`01-upload-preview.png`)
   - Drag/drop and Browse file affordances are clear.
   - File name is shown after selection.
   - Advanced load options are available without dominating the main action.
   - At the captured 780×493 viewport, the preview table is below the fold; the user must scroll to discover profile filtering.

2. **Profile-column filter — mostly healthy** (`02-filtered-preview.png`)
   - “Filter profile columns” has a meaningful label and the Numeric/Datetime category controls are discoverable.
   - Search is useful for a wide dataset.
   - The control filters the profile list, not the data values. That distinction is easy to miss because both are called filters.

3. **Preparation overview — mixed**
   - The page explains that preprocessing is reversible and versioned, and exposes a visible pipeline preview/workbench entry point.
   - Preparation itself does not expose the same filter model; users have to return to Signals to filter values. This makes “prepare with filters” feel like two separate workflows.

4. **Signals filter controls — mixed** (`03-signals-filter-controls.png`)
   - Series chips expose an accessible “Filter range for [column]” button.
   - The surrounding tooltip says “Ctrl+click to target adaptive filters,” which documents a powerful interaction.
   - The actual filter affordance is icon-level and visually secondary; a first-time user is unlikely to infer that the chip has both color and range actions.
   - An adaptive filter target can persist into the session (`HUFL` was already targeted), but there is no prominent explanation of why that target is active.

5. **Numeric range modal and applied result — mixed** (`04-range-filter-applied.png`)
   - The modal has explicit Min/Max fields, sliders, available-range feedback, Clear, Cancel, and Apply. This is the strongest part of the flow.
   - Applying `HUFL = 20…40` closes the modal and the chart remains populated.
   - The applied range is not visibly summarized in the toolbar, next to the HUFL chip, or in a filter-status banner. The chart sampling text still says “Showing 1184 of 1184 points (approx.),” which does not help users verify the filter changed the dataset.
   - Recommendation: show an inline filter pill or badge such as `HUFL 20–40`, add a “Clear filters” action when active, and expose filtered/remaining row counts.

## Accessibility risks

- The captured controls have useful accessible names, including the per-series range buttons and modal inputs.
- The sidebar and toolbar are dense at 780px wide; horizontal clipping/truncation is visible in the screenshot, so important controls can fall outside the viewport.
- The audit did not test keyboard-only operation, focus return after closing the modal, screen-reader announcements for filter application, contrast in all themes, or touch-target sizing at 320/375px. These need separate testing.

## Evidence limits

This is a screenshot-and-interaction audit of the local browser session. It does not establish numerical correctness of the server-side filtering, persistence across reloads, mobile behavior, or full accessibility compliance.
