# EdaTime UI redesign guide

**Status:** Proposed design direction and implementation specification

**Date:** 2026-07-17

**Audience:** Product, frontend, charting, and engineering contributors

**Scope:** The complete browser application shell and all current user-facing workflows

## 1. Executive direction

EdaTime should feel like a precise engineering analysis workspace, not a collection of dashboards and not a developer tool with every option exposed at once.

The app already has strong technical foundations: local-first deployment, fast handling of large time-series data, linked analysis state, reversible preparation, GPU-accelerated charts, and unusually broad analytical coverage. The redesign should make those strengths legible. A professional user should always be able to answer five questions without reconstructing state from several toolbars:

1. Which dataset and revision am I looking at?
2. Which time range, filters, and preparation stages are active?
3. What question is this page designed to answer?
4. Which parameters produced the current result?
5. What is the next useful action?

The recommended visual concept is **Signal Studio**: a stylish, modern evolution of the precision-workspace idea.

- deep graphite, matte surfaces with crisp tonal layering;
- editorial typography and asymmetric, intentional page composition;
- a small spectral blue-to-cyan signature used in brand moments and active focus;
- one dominant result canvas rather than several equally prominent control bands;
- visible analytical context and provenance;
- progressive disclosure of expert parameters without hiding them;
- concise, explicit labels and units;
- restrained ambient color, with the richest colors reserved for data;
- consistent workflows across Timeseries, Relationships, Spectrum, Causality, and Drift.

The result should feel contemporary and recognizable without becoming a neon “cyber” dashboard. This is still a structural redesign, not merely a new palette. The largest improvement will come from changing hierarchy: context first, result second, primary controls third, and secondary configuration in an inspector.

## 2. Product scope and goal

### 2.1 What EdaTime is

EdaTime is a self-hosted exploratory analysis environment for time-indexed engineering data. It supports the complete early-analysis loop:

- load CSV or Parquet data, or ingest from a supported database;
- inspect schema, types, distributions, nulls, and quality;
- create a reversible preparation plan and materialize versioned results;
- explore multiple signals over time;
- compare variables through correlation, scatter, density, and matrix views;
- inspect frequency-domain behavior with FFT/PSD and spectrograms;
- investigate causal candidates and distribution drift;
- carry time range, selected series, filters, and preparation state between views;
- export plots, filtered data, plans, and reproducible artifacts.

### 2.2 The product promise

> Move from an unfamiliar time-series dataset to a defensible analytical finding without leaving the browser or losing the exact context that produced the result.

The UI should reinforce three properties:

- **Speed:** loading, changing scope, and moving between views feels immediate.
- **Trust:** active filters, transformations, sampling, and method parameters are never ambiguous.
- **Depth:** expert controls are available when needed, but do not dominate the initial reading of a result.

### 2.3 Primary users

| User | Typical goal | UI requirement |
|---|---|---|
| Data or reliability engineer | Find incidents, regime changes, bad sensors, and correlations | Fast navigation, explicit units, visible time/filter context, dense charts |
| Applied scientist | Compare methods and inspect relationships | Precise parameters, result provenance, repeatable runs, exports |
| Data engineer | Validate schema, quality, ordering, and preparation | Version identity, reversible stages, quality summaries, safe materialization |
| Technical reviewer | Verify how a result was produced | Read-only context summary, exact method settings, reproducible export |
| New evaluator | Understand whether the tool fits a dataset | Clear starting workflow, sample data, helpful empty states |

The default interface should be optimized for a technically literate repeat user. Guidance should remain available, but it should not permanently consume analysis space.

## 3. Evidence from the current app

This guide was informed by a live walkthrough on 2026-07-17, using ETTm2 in the running Vite application. The rendered app was inspected at 1440×900 and 414×896 across Home, Upload, Timeseries, Prepare, Correlations, Scatter, FFT/PSD, Spectrogram, Causal, Drift, the Analysis Context drawer, Pipeline Workbench, Settings-related shell behavior, and both themes. The existing responsive audit in `usage_issue.md` was also treated as a current implementation record.

### 3.1 What should be preserved

- The sidebar separates core workflow from advanced analysis.
- The current responsive work prevents root-level horizontal overflow and preserves meaningful chart height on phones.
- The mobile navigation is a real accessible drawer with focus management.
- Shared series chips and custom dropdowns already provide a reusable control foundation.
- Timeseries, Scatter, Causal, and Drift have real empty, loading, and disabled states.
- Analysis Context exposes dataset, time range, selected series, and numeric filters.
- The Pipeline Workbench makes source revision and reversible stages concrete.
- Prepare distinguishes the source dataset from the working dataset.
- Correlations can drill into pairwise analysis without inventing another backend model.
- Spectrogram is a strong reference for a chart-first responsive page.
- The application already has page-level help, keyboard navigation, light/dark themes, and a compact sidebar mode.

### 3.2 Current hierarchy problems

The app is functional, but much of the chrome has the same visual weight.

- Product branding appears in both the sidebar and top bar, while dataset identity is less prominent.
- Page titles are small uppercase labels that read like toolbar captions, not orientation anchors.
- The top bar exposes keyboard help, settings, Workflow, Plan, theme, and Context as peers. It gives utility actions more emphasis than the active dataset.
- The guided workflow can add a second full-width band between the shell and the page. When open, it competes directly with the current task.
- Analysis pages often stack a title row, series row, multiple boxed control groups, status rows, and then the result. The chart is visually important by size, but not by hierarchy.
- Outlined segment boxes are nested inside outlined toolbar boxes. This creates a “panel inside panel” effect and makes every parameter look equally important.
- Current controls mix action, configuration, display, export, zoom, annotation, and status in the same horizontal plane.
- Generic actions such as `Compute`, `Preview`, `More`, `Open`, and `Plan` require the user to infer their scope.
- Repeated abbreviations and uppercase eyebrow labels reduce scan speed, especially in Drift and Correlations.
- The Home page still behaves partly like a feature catalogue after a dataset is loaded, rather than becoming a useful workspace overview.
- The light theme currently changes the shell and series row more successfully than the secondary analysis toolbar, producing an incomplete theme transition.

### 3.3 Live page observations

#### Timeseries

The result canvas is strong, but the current desktop view places Series, Draw, Labels, Notes, Export, Analytics, Zoom, and Quick Range above it. In the live session, Quick Range appeared twice after workflow interaction, demonstrating how duplicated controls can emerge when responsive and canonical surfaces are both visible. Selected and unselected chips are also visually large relative to the chart header.

#### Correlations

The matrix itself is readable and appropriately dominant. The control region is fragmented across Metric, Matrix, Display, Export, and Pipeline cards. `Snap to panel` and `Fit color axis` are visually as strong as the metric choice even though they are secondary display actions.

#### Scatter

The page combines view selection, axes, display mode, distribution, linked range, refine controls, export, inherited filter context, correlation suggestions, threshold, statistics, and the result. The controls are logically valid, but too many surfaces are visible before the user can read the plot.

#### FFT / PSD

The chart uses space well. The top controls are more restrained than Timeseries, but Display, Filter, Export, traces, chart legend, sample rate, Nyquist, and top peaks still lack a clear primary-to-secondary order. The bottom metrics need stronger formatting and more space for exact values.

#### Spectrogram

This is the best current analysis-page reference. The result remains dominant, the Compute action is clear, and core inputs fit into a compact region. The result summary is useful, though it should become a shared result-metadata pattern rather than a page-specific floating card.

#### Causal

The empty canvas is very large while selected columns, algorithm parameters, and graph actions are split across top and bottom edges. The page needs a setup-to-result workflow and a useful pre-compute canvas rather than an undifferentiated empty region.

#### Drift

Responsive behavior is now robust, but desktop controls remain compressed into multiple bordered bands. Column selection, windowing, evaluation mode, reference, dates, zoom, thresholds, export, and Run are all presented before a result exists. The empty-state instructions are repeated immediately above and inside the canvas.

#### Upload and Prepare

Upload has a sound source/preview split, but the inactive upload action floats separately from the source card and advanced options. Prepare communicates reversibility well, yet the full-page overview and Pipeline Workbench modal duplicate some concepts and actions.

#### Context and global tools

The Analysis Context drawer contains valuable information, but it overlays a large part of the result and hides global actions while open. In the live walkthrough, Escape did not dismiss it, so it also behaved differently from the modal surfaces. The Pipeline Workbench is powerful and substantially more professional than the general toolbar styling; its source/output graph and action footer should influence the rest of the product.

## 4. Design principles

### 4.1 Result first

The chart, matrix, graph, table, or preparation pipeline is the main content. At a normal desktop viewport, the result should begin no lower than 180 px from the app top unless the task intrinsically requires more setup.

### 4.2 Data-dense, not control-dense

Professional software can be dense. The density should come from useful values, annotations, comparisons, and context—not from exposing every possible control simultaneously.

### 4.3 Progressive precision

Show the smallest parameter set that can produce a meaningful result. Keep full expert settings one click away in a stable inspector with a summary of applied values.

### 4.4 Context is part of the result

Dataset revision, preparation plan, time range, filters, selected columns, method, and sampling policy are not peripheral metadata. They define the result and must travel with it.

### 4.5 One clear action per state

Each page state should have one obvious next action: load data, preview file, apply plan, update spectrum, run causal discovery, or run drift analysis. Secondary actions must not compete with it.

### 4.6 Explicit over clever

Use domain labels, units, and full action names. Tooltips should add detail, not repair vague labels.

### 4.7 Reversible by default

Visual changes, query filters, preparation stages, and materialized dataset changes must look and behave differently. Potentially dataset-changing actions should state their consequence.

### 4.8 Calm visual hierarchy

Reserve bright cyan/blue for focus, selection, and primary actions. Avoid using glow, gradients, borders, and colored fills simultaneously to communicate the same state.

### 4.9 Consistency without forced uniformity

All analysis pages should share structure and state behavior. Their visualizations and domain-specific controls may differ.

### 4.10 Desktop-first, fully operable when compact

The main professional workflow is desktop analysis, but phone and tablet layouts must remain complete for review, triage, and light interaction. Compact layouts should reorder and disclose controls rather than silently remove them.

## 5. Target information architecture

The current routes can remain stable while the visible navigation is reorganized around user questions.

| Navigation group | Visible destination | Current implementation | Question answered |
|---|---|---|---|
| Workspace | Overview | Home | What is loaded, what changed, and where should I continue? |
| Workspace | Data source | Upload | What data am I working with and is it usable? |
| Workspace | Preparation | Prepare + Pipeline Workbench | How is the working dataset derived? |
| Explore | Signals | Timeseries | What happened over time? |
| Explore | Relationships | Correlations + Scatter/Matrix/Distribution tabs | Which variables move together, and how? |
| Explore | Spectrum | FFT/PSD + Spectrogram tabs | Which frequencies dominate, and when? |
| Diagnose | Causality | Causal | Which lagged directional relationships are plausible? |
| Diagnose | Drift | Drift | Where and how did distributions change? |

### 5.1 Why group related pages

Correlations and Scatter are stages of one relationship workflow: screen pairs, inspect a cell, then examine the detailed pair. FFT and Spectrogram are two views of frequency behavior with shared column, range, normalization, and frequency context. Grouping them:

- shortens the sidebar;
- reduces arbitrary jumps between page concepts;
- makes shared state visible through tabs;
- creates a natural path from overview to detail;
- preserves current URLs as deep links and backing views.

### 5.2 Navigation labels

Use title case and domain language. Avoid exposing implementation names such as `Heatmap` where the task is broader.

- `Home` → `Overview`
- `Upload` → `Data source`
- `Prepare` → `Preparation`
- `Timeseries` → `Signals`
- `Correlations` and `Scatter` → `Relationships`
- `FFT` and `Spectrogram` → `Spectrum`
- `Causal` → `Causality`
- `Drift` remains `Drift`

The first release may retain current labels if renaming documentation is too disruptive. The grouping and page hierarchy matter more than the exact nouns.

## 6. Target application shell

### 6.1 Desktop layout

```text
┌──────────────────┬─────────────────────────────────────────────────────────────┐
│ EdaTime          │ ETTm2 / source-2 r2   69,680 rows   7 values   Saved 10:54 │
│                  │ Range: full dataset   Filters: 3   Plan: source baseline   │
│ WORKSPACE        ├─────────────────────────────────────────────────────────────┤
│ Overview         │ Signals                                      [Help] [•••]  │
│ Data source      │ Inspect behavior over time                                  │
│ Preparation      ├─────────────────────────────────────────────────────────────┤
│                  │ [Series: HUFL, HULL, OT] [Full range]       [Update view]  │
│ EXPLORE          ├──────────────────────────────────────────┬──────────────────┤
│ Signals          │                                          │ Inspector        │
│ Relationships    │             Result canvas                │ Appearance       │
│ Spectrum         │                                          │ Analytics        │
│                  │                                          │ Annotations      │
│ DIAGNOSE         │                                          │ Export           │
│ Causality        │                                          │                  │
│ Drift            ├──────────────────────────────────────────┴──────────────────┤
│                  │ Range · cursor · selection · result provenance              │
│ Settings         │                                                             │
└──────────────────┴─────────────────────────────────────────────────────────────┘
```

### 6.2 Sidebar

- Use one product identity in the sidebar; remove the duplicate brand lockup from the top bar.
- Default width: 216–224 px. Collapsed width: 56–60 px. Do not scale with viewport width.
- Show three navigation groups: Workspace, Explore, Diagnose.
- Use one 18 px icon family with consistent stroke weight.
- Active state: subtle surface fill plus a 2 px accent marker. Remove glow.
- Show keyboard shortcuts in tooltips, not persistent badges on every row. Shortcut badges make the navigation read like a command reference instead of a workspace.
- Keep Settings at the bottom. Keep theme selection inside Settings and optionally in the command menu; it does not require permanent top-bar space.

### 6.3 Workspace bar

Replace the current brand-heavy top bar with a workspace bar that answers “what am I analyzing?”

Left side:

- dataset name;
- source/revision identifier;
- save/freshness state;
- compact row and value-column counts.

Center or second line when space permits:

- current time range;
- active filter count;
- active preparation-stage count;
- warning state for sampling, partial load, stale result, or unsaved plan edits.

Right side:

- command palette;
- context/provenance;
- notifications or job status when relevant;
- overflow menu containing keyboard help, theme, and settings.

Every context item is a button or link to its owner. `3 filters` opens filter details. `2 stages` opens Preparation. The bar is informational first, not a row of opaque global buttons.

### 6.4 Guided workflow

Remove the persistent global workflow band. Replace it with:

- a `Next recommended step` card on Overview;
- a small optional recommendation beside the page title when it is relevant;
- a `Guided workflow` section in the command palette for new users;
- dataset-scoped dismissal and completion state, preserving current persistence semantics.

An example page-level recommendation is `Three series selected. Screen their relationships →`, not a global banner that repeats on every page.

### 6.5 Page header

Each page uses one 52–64 px header:

- title, 18–20 px semibold;
- one-sentence purpose, 13 px muted text on desktop;
- optional workspace tabs;
- page help as a labeled `Help` action in the overflow or an accessible adjacent icon;
- one page-specific action only when it is meaningful at header level.

Do not use all-uppercase page titles. Uppercase may remain for small group labels.

### 6.6 Inspector

The inspector is the stable home for secondary controls. It replaces many toolbar cards and one-off modals.

- Desktop width: 300–340 px.
- May be pinned, collapsed, or opened contextually.
- Uses sections with descriptive names and applied-value summaries.
- Remembers open/collapsed state per workspace, not globally.
- Changing a setting marks the result as `Needs update` when recomputation is required.
- Visual-only settings apply immediately.
- On tablet it becomes an overlay drawer.
- On phone it becomes a bottom sheet with a sticky action footer.

Recommended shared sections:

- Scope
- Parameters
- Display
- Annotations
- Export
- Result details
- Provenance

## 7. Shared analysis-page anatomy

Every analytical workspace should use the same five regions.

1. **Orientation:** title, purpose, and optional view tabs.
2. **Scope bar:** selected columns, time range, filters, baseline, or other inputs that define which data is being analyzed.
3. **Result canvas:** chart, matrix, graph, table, or an actionable state.
4. **Result footer:** cursor, selection, visible counts, method summary, warnings, and provenance.
5. **Inspector:** secondary parameters, presentation, export, and details.

### 7.1 Control priority

| Priority | Meaning | Placement | Examples |
|---|---|---|---|
| P0 | Required to define the analysis | Scope bar | X/Y columns, signal, baseline, method |
| P1 | Primary action or frequent scope change | Scope bar/header | Run drift analysis, full range, selected series |
| P2 | Expert method parameter | Inspector | τ max, FDR, bins, normalization |
| P3 | Presentation or export | Inspector/result action menu | Color scale, labels, PNG, CSV |
| P4 | Rare administration or help | Overflow/settings | Theme, keyboard reference, reset defaults |

No page should show P0 through P4 in one toolbar.

### 7.2 Recompute behavior

- A change that affects data or analysis marks the current result as stale.
- Keep the old result visible with a subtle `Parameters changed` badge.
- The primary action changes to `Update analysis` and lists the important delta in its tooltip or adjacent summary.
- Never clear a valid result merely because a dropdown changed.
- On successful update, show duration and the applied parameter timestamp in Result details.

### 7.3 States

Each result region must implement the same state model:

| State | Required content |
|---|---|
| No dataset | Explanation, `Open Data source`, and sample option where appropriate |
| Ready to configure | Question-oriented instruction and required missing inputs |
| Ready to run | Summary of scope and one explicit primary action |
| Loading | Keep layout stable, show operation name, elapsed time after 2 s, Cancel when supported |
| Success | Result, parameter summary, duration, warnings, and export |
| Empty result | Explain whether filters, range, sampling, or method caused zero output; offer a scoped recovery action |
| Error | Human summary, correlation ID/details disclosure, Retry, and safe recovery action |
| Stale result | Preserve result, label it stale, show what changed, and offer Update |

Avoid repeating the same instruction immediately above and inside an empty canvas.

## 8. Page-by-page redesign

### 8.1 Overview

Overview should adapt to whether a dataset is loaded.

#### No dataset

- Compact product statement: `Explore and diagnose time-indexed data locally.`
- Primary action: `Load a dataset`.
- Secondary row of sample datasets with real metadata.
- A concise three-step workflow: Load → Explore → Diagnose.
- Advanced capabilities below the fold, not a full catalogue in the first viewport.

#### Dataset loaded

Replace the marketing hero with a workspace summary:

- dataset name, source, revision, rows, columns, time span, cadence, memory/size when available;
- quality summary: nulls, non-finite values, duplicate timestamps, ordering, irregular cadence;
- active preparation plan and whether it is materialized;
- `Continue where you left off` with the last workspace and state;
- recommended next step based on current state;
- recent analysis runs or exports if the product later retains them.

The sample cards become a secondary `Switch dataset` disclosure to reduce the risk of replacing active work accidentally.

### 8.2 Data source

Use a staged ingest workflow without turning it into a wizard that hides the preview.

#### Layout

- Source tabs: File, Database.
- Left/top: source input.
- Main: schema and profile preview.
- Inspector: load options and destination consequences.
- Sticky footer: file summary, warnings, and `Load as active dataset`.

#### File flow

1. Choose or drop a file.
2. Show filename, format, size, detected delimiter/schema, and preview status.
3. Populate the profile table.
4. Allow column and row/time-range selection.
5. State clearly that loading replaces the active in-memory dataset.

Rename `Upload & Ingest` to `Load as active dataset`. Disable it with visible reason text, not low opacity alone.

#### Profile table

- Sticky header and first column.
- Column name, role, type, validity, nulls, min/max, and compact distribution.
- Use warning icons and text for quality issues; do not depend on histogram color.
- Support keyboard row navigation and bulk selection.
- Preserve internal horizontal scrolling without widening the page.

### 8.3 Preparation

Preparation should be the canonical full-page owner of the reversible pipeline. The global Plan action should open a compact inspector or navigate here, not duplicate the entire workbench mental model.

#### Layout

- Header: dataset revision and `Materialize new version` action.
- Summary strip: source → N active stages → working result.
- Main split view: ordered stage list on the left, selected-stage configuration/preview on the right.
- Bottom or collapsible region: quality findings and impact report.

#### Stage list

- Number, enabled state, operation name, affected columns, and row/schema impact.
- Drag or keyboard reorder with explicit handles.
- Undo/redo in the local header.
- Disabled stages remain readable without strike-through as the only signal.
- `Add stage` opens a categorized command menu: Rows, Values, Time, Schema, Derived.

#### Materialization

Use consequence-oriented copy:

- `Preview working result`
- `Materialize as new dataset version`
- `Return to source baseline`

Show expected row/schema changes before materialization. Keep export of plan/code under a Reproduce tab or inspector section.

### 8.4 Signals

Signals is the primary exploration workspace and should establish the design pattern for the rest of the app.

#### Default layout

- Scope bar: series picker, selected-series rail, time-range control, filter summary.
- Canvas: chart with an in-canvas interaction toolbar.
- Footer: visible range, Y range, cursor, selection, point count/sampling, and status.
- Inspector: Appearance, Analytics, Annotations, Export.

#### Series selection

- Replace the large always-visible chip rail with a searchable multiselect plus compact selected chips.
- Use at most one line by default; overflow continues in a popover.
- Each selected series exposes color, visibility, numeric filter, and remove actions through one menu.
- Make the active adaptive-filter target explicit with icon and text, not border color alone.

#### Chart interaction toolbar

Only show tools that operate directly on the canvas:

- Pan/inspect
- Box zoom
- Draw annotation
- Reset view

When Draw is active, reveal color, width, undo, and clear near the chart. Do not permanently reserve a Draw control group.

#### Inspector

- Appearance: color by, line style, legend, labels.
- Analytics: rolling bands, anomalies, method parameters.
- Annotations: list and edit existing notes/drawings.
- Export: image versus data, with scope summary.

Quick ranges must have one canonical surface. Recommended: a compact range control in the scope bar with presets and a custom-range option.

### 8.5 Relationships

Combine the current Correlations and Scatter workflow under one page header with tabs:

- Matrix
- Pair plot
- Distribution

#### Matrix

- Scope: metric, selected columns, clustered ordering.
- Canvas: matrix and adjacent scale with no competing card grid above it.
- Cell click selects a pair and opens a compact detail popover.
- Double click or `Open pair plot` moves to Pair plot with X/Y preserved.
- Cell-size, axis fit, labels, and export live in the inspector.

#### Pair plot

- Scope: X, Y, optional color, linked-range/filter badge.
- View switch: Points / Density.
- Canvas owns the plot and marginal displays.
- Correlation values, visible/total points, sampling, and filter context belong in the result footer.
- Suggestions move to an inspector section titled `Suggested pairs`, ranked with metric and scope.

#### Distribution

- Preserve histogram/KDE/box capabilities as a view of the active variables.
- Do not mix the distribution selector into a generic Display card.
- Use consistent comparison controls and clearly state whether the result is filtered or full-dataset.

Inherited filters should appear as one context badge: `Timeseries scope · full range · 3 numeric filters`. Expanding it shows details and a scoped `Clear inherited filters` action.

### 8.6 Spectrum

Combine FFT/PSD and Spectrogram under shared scope and tabs:

- Spectrum
- Time-frequency

Shared state includes active signal, time range, normalization policy, and sampling/cadence summary.

#### Spectrum tab

- P0 controls: selected signals, Magnitude/PSD, scale.
- Inspector: filtering, clipping, normalization, peak-detection settings, export.
- Result footer: sample rate, Nyquist, resolution, window/range, point count.
- Top peaks use a proper table with rank, frequency, reciprocal period, amplitude/power, and signal.
- Selecting a peak creates a cursor/annotation in the chart.

#### Time-frequency tab

- P0 controls: signal, window, hop, `Update spectrogram`.
- Inspector: scale, normalization, outlier policy, palette, export.
- Keep the current strong chart-first behavior and compact summary.
- Hover should show time, frequency, reciprocal period, and intensity with units.

Switching tabs should preserve the active signal and range. Where parameter equivalence is not exact, show the resolved setting instead of silently translating it.

### 8.7 Causality

Structure Causality as a setup/run/result workspace.

#### Before the first run

- The empty canvas shows a short method explanation and a visual scope summary.
- Scope bar: selected variables and method.
- Inspector: test, τ max, α, PC α, maximum conditions, FDR, and advanced settings.
- Primary action: `Run causal discovery`.
- Show an estimated work indicator when a high lag/column combination approaches the backend budget.

#### During compute

- Keep the canvas stable.
- Show `Running PCMCI with ParCorr · 7 variables · τ max 3`.
- Provide elapsed time, cancellation if supported, and a concise explanation that graph actions unlock after a valid result.

#### Result

- Graph toolbar is attached to the result: fit, filter edges, edit, compare, export.
- Right inspector becomes Results: edge filters, selected-node details, run parameters, warnings.
- `Save run` and `Compare runs` belong together and are enabled only when their prerequisites exist.
- Edge direction, lag, sign, strength, and uncertainty must use multiple cues beyond color.

### 8.8 Drift

Drift should read as an investigation workflow, not a configuration form.

#### Scope bar

- selected columns;
- window size;
- evaluation mode;
- baseline summary;
- primary action: `Run drift analysis`.

#### Inspector

- Baseline: first portion, latest portion, or explicit dates.
- Metrics and thresholds: composite defaults first, exact values in an advanced section.
- Display: detail view, sorting, zoom/reset.
- Export.

#### Result layout

- Persistent run summary: `363 windows · 18 flagged · 3 major · baseline first 50%`.
- Tabs: Overview, Timeline, Segments, Quality, Relationships.
- Timeline is the primary default; selecting a flagged window updates detail without changing page layout.
- Use a severity legend with words and shapes, not only red/amber colors.
- Threshold changes mark the result stale or recompute derived classification explicitly; the UI must distinguish local reclassification from a new backend analysis.

The initial empty state should appear once inside the result region. It should list missing prerequisites dynamically.

### 8.9 Settings

Keep Settings as a modal or drawer rather than a primary route.

- Categories: Appearance, Analysis defaults, Signals, Keyboard, About.
- Use a draft model: Apply persists; Cancel restores the baseline; unsaved changes are visible.
- Theme preview must cover shell, toolbars, charts, overlays, and syntax/metric surfaces.
- Density choices should be `Comfortable` and `Compact`, with explicit examples. Default to Compact on analysis pages and Comfortable on workflow/forms only if mixed density can remain predictable.
- Keep Reset scoped to the current category, with a separate `Reset all settings` confirmation.

## 9. Visual system

### 9.1 Visual character

Aim for a **modern signal studio**: the confidence of a laboratory instrument, the composition of an editorial data product, and the efficiency of a professional IDE.

- Opaque or nearly opaque surfaces.
- Minimal blur and no decorative glow.
- One border per meaningful container.
- Large empty areas use background and spacing, not nested cards.
- Accent color communicates interactivity and selection, not decoration.
- Charts are visually richer than the shell.
- Page composition may be subtly asymmetric; control alignment and numeric tables remain exact.
- Use one recognizable spectral accent motif, not a different visual theme for each page.

### 9.2 Style directions considered

Three styles fit the product, but they create different impressions.

#### Direction A — Precision Lab

**Mood:** restrained, industrial, exact, familiar.

**Visuals:** flat graphite surfaces, thin dividers, compact controls, very little decoration.

**Strength:** lowest implementation risk and maximum perceived seriousness.

**Risk:** can feel generic or austere; does not create a memorable product identity by itself.

#### Direction B — Signal Studio — recommended

**Mood:** modern, focused, refined, technically creative.

**Visuals:** deep graphite canvas, slightly lighter floating work surfaces, strong editorial headings, crisp data typography, a narrow blue-to-cyan spectral accent, and restrained micro-motion.

**Strength:** distinctive and stylish while keeping analytical results central.

**Risk:** spectral color and motion must remain disciplined or the app will drift toward a gaming/cyber aesthetic.

#### Direction C — Technical Paper

**Mood:** scientific publication, notebook, blueprint.

**Visuals:** light-first warm-gray canvas, ink typography, cobalt annotations, fine graph-paper rhythm, tables that resemble technical reports.

**Strength:** excellent for review, screenshots, and print-like analytical credibility.

**Risk:** dense charts and long sessions are less comfortable for users who expect a dark engineering tool; it is better as a fully realized light theme than as the sole identity.

Signal Studio should be the main identity. Technical Paper should inform the light theme, while Precision Lab supplies the discipline that prevents Signal Studio from becoming decorative.

### 9.3 Signal Studio signature

The style needs a few repeatable signatures rather than widespread decoration.

1. **Spectral edge:** a 2 px blue-to-cyan line appears only on the active navigation item, focused result frame, or current pipeline node. It replaces glow and thick colored fills.
2. **Dataset ribbon:** the workspace bar may show a tiny functional sparkline/cadence mark beside the dataset name. It represents loaded data or freshness; it is not a random waveform logo repeated throughout the app.
3. **Editorial page header:** the page title and one-line question use generous horizontal space, while exact scope metrics align on the opposite side. This creates a composed, less form-like first impression.
4. **Floating inspector:** the inspector sits on a slightly raised tonal surface with a clear vertical edge. It feels like a tool palette, not another dashboard card.
5. **Technical numerals:** timestamps, counts, frequencies, lag values, and metrics use tabular figures or a locally hosted monospace companion.
6. **Quiet motion:** drawers, stale-state changes, and tab transitions use 140–180 ms easing. Charts do not animate gratuitously on every recompute.
7. **Data owns color:** vivid categorical and continuous palettes appear in charts, legends, and selected-series indicators. The rest of the UI remains neutral.

Avoid the following even in the stylish direction:

- large blurred color blobs behind charts;
- frosted glass on every surface;
- neon outer glow around controls;
- animated decorative waveforms;
- gradients inside ordinary buttons;
- purple/blue tinting on every dark surface;
- oversized rounded cards that turn a technical workspace into a consumer landing page.

### 9.4 Dark theme tokens

| Role | Proposed value | Use |
|---|---|---|
| Canvas | `#0B0F14` | Chart and application background |
| Shell | `#0E141B` | Sidebar and workspace bar |
| Surface | `#121A23` | Inspector, tables, controls |
| Raised surface | `#18222D` | Menus, dialogs, selected panels |
| Border | `#273442` | Structural boundaries |
| Subtle border | `#1C2732` | Dividers and table rows |
| Text strong | `#F1F5F9` | Titles and primary values |
| Text | `#C8D2DC` | Body and controls |
| Text muted | `#8291A4` | Secondary labels |
| Accent | `#2F9BFF` | Focus, selection, primary action |
| Accent secondary | `#20D5C8` | Spectral edge endpoint and linked-state detail |
| Accent subtle | `#123A5C` | Selected backgrounds |
| Success | `#3FB984` | Valid/complete |
| Warning | `#E5A84B` | Partial/stale/attention |
| Danger | `#E06C75` | Errors/destructive actions |

Use alpha only when an overlay genuinely needs transparency. Avoid a large family of nearly identical translucent surfaces.

### 9.5 Light theme tokens

| Role | Proposed value |
|---|---|
| Canvas | `#F5F7FA` |
| Shell | `#FFFFFF` |
| Surface | `#FFFFFF` |
| Raised surface | `#F8FAFC` |
| Border | `#CDD6E0` |
| Subtle border | `#E4E9EF` |
| Text strong | `#15202B` |
| Text | `#334155` |
| Text muted | `#64748B` |
| Accent | `#087FD1` |
| Accent subtle | `#E4F3FD` |

Light theme is not a token-only inversion. Chart grid, empty overlays, disabled controls, toolbars, selection chips, color scales, and modal backdrops require explicit theme regression coverage.

The light theme takes cues from Technical Paper: cool-white work surfaces, charcoal text, precise cobalt annotation, and minimal shadow. It must look deliberately designed rather than like dark-theme variables were inverted.

### 9.6 Data color

UI accent and chart series color must be separate systems.

- The app accent is blue.
- Categorical chart colors use a color-vision-aware palette and repeat with line/dash/marker differences.
- Sequential and diverging scales expose the exact palette name in Result details.
- Correlation uses a centered diverging scale with a perceptually neutral zero.
- Severity uses icon/shape/label in addition to hue.
- Selected series should not become indistinguishable from the primary button.

Recommended categorical starting set:

`#56B4E9`, `#E69F00`, `#009E73`, `#CC79A7`, `#F0E442`, `#0072B2`, `#D55E00`, `#8A7CC9`.

Validate the palette on both canvas themes and with thin 1 px lines.

### 9.7 Typography

Keep the app self-hosted and fast. The preferred stylish option is a locally hosted variable font such as Geist Sans or Inter Variable, with the system stack as fallback. Do not depend on Google Fonts or another runtime font service:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

Use a tabular/monospace stack for timestamps, exact metrics, code, and aligned numeric tables.

If a companion monospace face is introduced, self-host Geist Mono or IBM Plex Mono and subset it to the weights actually used. The UI must remain metrically stable while fonts load.

| Style | Size / line height | Weight | Use |
|---|---:|---:|---|
| Workspace title | 24 / 32 px | 650 | Overview only |
| Page title | 20 / 28 px | 650 | Page orientation |
| Section title | 15 / 22 px | 600 | Inspector/card sections |
| Body | 14 / 21 px | 400 | Explanations |
| Control | 13 / 18 px | 500 | Inputs and buttons |
| Label | 11 / 16 px | 650 | Group labels, optional uppercase |
| Metric | 13 / 18 px | 500 mono/tabular | Values and status |

Do not letter-space normal body or control labels. Reserve uppercase tracking for short navigation group labels.

### 9.8 Spacing and shape

- Base spacing unit: 4 px.
- Common gaps: 8, 12, 16, 24, 32 px.
- Control height: 32 px compact desktop, 36 px comfortable desktop, 44 px touch.
- Radius: 6 px controls, 10 px surfaces, 12 px dialogs. The slightly softer work surfaces support the modern style; avoid a different radius for every component.
- Pills are reserved for tags, filters, and statuses—not all buttons and inputs.
- Shadows are reserved for menus, drawers, and dialogs. Embedded panels use borders or background contrast.

### 9.9 Density

Professional does not mean spacious everywhere. Use density by task:

- Charts and matrices: compact chrome, maximum result area.
- Tables and stage lists: compact rows with generous hover/focus affordance.
- Upload and settings forms: comfortable vertical rhythm.
- Empty states: concise, centered within a bounded content width.

## 10. Component system

Build on the existing plain TypeScript primitives and composites. Do not introduce a framework, component library, Tailwind, CSS-in-JS, or a second style system.

### 10.1 Required shared components

| Component | Responsibility |
|---|---|
| `WorkspaceBar` | Dataset, revision, freshness, range, filter, and plan context |
| `PageHeader` | Title, purpose, tabs, help, page actions |
| `ScopeBar` | P0/P1 inputs that define the analysis |
| `Inspector` | Stable secondary configuration and result details |
| `InspectorSection` | Label, applied summary, reset/default state, body |
| `RunAction` | Named async action, stale state, progress, cancel/retry |
| `ResultFrame` | Canvas plus standardized loading/empty/error/stale overlays |
| `ResultFooter` | Scope, point/window counts, cursor/selection, warnings, provenance |
| `ContextBadge` | Expandable range/filter/plan summary |
| `MetricStrip` | Aligned exact values with units and warning states |
| `ViewTabs` | Matrix/Pair, Spectrum/Time-frequency, result tabs |
| `DataTable` | Sticky, sortable, keyboard-operable technical tables |
| `CommandMenu` | Navigation, actions, recent views, help, guided workflow |
| `ProvenanceSummary` | Exact dataset/query/plan/method identity for a result |

### 10.2 Buttons

- Primary: one per visible region.
- Secondary: bordered or subtle fill.
- Ghost: low-frequency local action.
- Destructive: danger styling plus consequence copy.
- Icon-only: only for universally understood actions; always labeled accessibly and tooled with text.

Avoid embedding a label such as `EXPORT` beside another button labeled `EXPORT`. Use `Export` once.

### 10.3 Dropdowns and inputs

- Visible labels remain outside values.
- Truncated values expose their full value on focus/hover and through accessible text.
- Numerical fields show units in the control or directly adjacent.
- Advanced settings show default and valid range.
- Disabled state includes reason text or tooltip and sufficient contrast.

### 10.4 Chips and filters

Use distinct variants:

- series chip: color + name + visibility;
- filter chip: field + operator + value + remove;
- status chip: icon + semantic state;
- metadata tag: read-only, neutral;
- recommendation chip: action language, not a status color.

Do not use one generic pill style for all of them.

### 10.5 Dialogs, drawers, and sheets

- Dialog: short, blocking decision or focused edit.
- Drawer/inspector: persistent secondary context or configuration.
- Bottom sheet: compact-screen form of a drawer.
- Full page: multi-stage work such as Preparation.

The current Analysis Context should use the shared drawer controller and close on Escape. The Pipeline Workbench should either evolve into the Preparation page or remain a deliberately scoped modal, not both at equal feature depth.

## 11. Chart and result design

### 11.1 Canvas

- Result canvases use the base canvas color, not a visually separate purple/navy theme.
- Grid lines are visible but subordinate.
- Axes and labels meet contrast requirements without becoming brighter than data.
- Keep at least 12–16 px clear space between controls and plot bounds.
- Avoid floating cards over important data unless they move or collapse.

### 11.2 Legend

- Prefer a compact scrollable legend outside the plot for more than four series.
- Hover/focus highlights the series and dims others.
- Legend state and series chip state are one model.
- Long names truncate with the full value available.

### 11.3 Tooltip

- Align values in a small table.
- Show exact time, series, value, and unit.
- Indicate sampled/interpolated/filtered points when relevant.
- Keep keyboard and touch inspection available.

### 11.4 Selection and zoom

- Always show whether the current range is full, zoomed, preset, or inherited.
- Reset uses `Reset view`, not an unlabeled circular arrow alone.
- Zoom history is a chart interaction, not a general page parameter.
- Cross-view propagation is communicated through the context badge.

### 11.5 Sampling and approximation

Sampling, downsampling, density binning, cached results, and approximate values affect interpretation. Show them in Result details and warn only when material:

- `69,680 source rows · 4,000 rendered points · LTTB`
- `Density view · 64 × 64 bins`
- `Correlation calculated on filtered working dataset`

## 12. Content and terminology

### 12.1 Action labels

Use object + consequence:

| Current or generic | Preferred |
|---|---|
| Compute | Run drift analysis / Run causal discovery / Update spectrogram |
| Plan | Preparation plan |
| Context | Analysis context |
| Preview | Preview working result |
| Apply | Apply settings / Materialize new version |
| Clear | Clear drawings / Clear inherited filters |
| More | Display settings / Export formats / Advanced parameters |
| Open | Edit annotations / Open result details |

### 12.2 Technical language

- Keep accepted domain terms such as PSD, PCMCI, ParCorr, FDR, PSI, KS, and Wasserstein.
- Expand an abbreviation on first use in page help and tooltips.
- Always show units.
- Prefer reciprocal period alongside very low frequency values.
- Use `time range`, `working dataset`, `source revision`, and `materialized version` consistently.

### 12.3 Empty-state voice

Be direct and diagnostic:

- `Select at least two numeric columns to screen relationships.`
- `No points match the current time range and 3 numeric filters.`
- `Choose a baseline before running drift analysis.`

Avoid motivational or marketing copy inside analysis results.

## 13. Responsive behavior

The recently implemented responsive frame should be preserved and simplified, not replaced with page-specific hiding rules.

### 13.1 Breakpoints

- **≥1280 px:** persistent sidebar and optional pinned inspector.
- **900–1279 px:** collapsible sidebar; inspector defaults closed or overlay.
- **641–899 px:** icon sidebar or off-canvas navigation; scope bar wraps once; inspector is a drawer.
- **≤640 px:** off-canvas navigation; result precedes secondary configuration; inspector is a bottom sheet.

### 13.2 Compact page order

```text
App header
Page title + view tabs
Scope summary
Primary action
Result
Result footer
Secondary settings sheet
```

Do not place suggestions, verbose status, export formats, and advanced parameters before the chart on phone.

### 13.3 Compact acceptance criteria

- No root-level horizontal scrolling at 360, 414, 640, 768, 1024, 1440, and 1920 px.
- At 414×896, analysis result height is at least 300 px before a sheet opens.
- At 1024×768, analysis result height is at least 360 px for chart pages.
- Touch targets are at least 44×44 px.
- A required control is never available only by widening the viewport.
- Opening a drawer/sheet traps focus, locks background scroll, closes on Escape/backdrop, and restores focus.
- Reordering for compact layout preserves logical keyboard order.

## 14. Accessibility and professional quality

- Meet WCAG 2.2 AA for text, controls, focus, and non-text contrast.
- Do not rely on color alone for selection, severity, edge direction, or disabled state.
- Use semantic headings and landmarks; one `h1` per visible page.
- Every chart has an accessible name, concise summary, and a data/details alternative where practical.
- Announce compute start, completion, cancellation, empty result, and failure through the existing live region.
- Use `aria-busy` on the result frame, not the entire application.
- Custom dropdowns expose label, value, expanded state, keyboard navigation, and typeahead.
- Drawers and dialogs share one tested focus/escape/background contract.
- Respect reduced motion; never animate large chart or drawer movement purely for decoration.
- Use locale-aware display but ISO/UTC detail where ambiguity matters.
- Keep error correlation IDs copyable and separate from human-readable messages.

## 15. Implementation strategy

The redesign should be incremental and should preserve current behavior, routes, API contracts, and vanilla TypeScript architecture.

### Phase 0 — Baseline and design-system inventory

1. Capture reference screenshots for every page in dark and light themes at 1440×900, 1024×768, and 414×896 using ETTm2.
2. Inventory all toolbar groups, buttons, chips, dropdowns, dialogs, drawers, status surfaces, and empty states.
3. Mark each existing control P0–P4 using the priority model in this guide.
4. Record current task timings: load sample, plot three signals, inspect a pair, run FFT, run causal discovery, run drift.
5. Add visual-theme and duplicate-control regression checks before structural migration.

### Phase 1 — Tokens and shell

Primary owners:

- `frontend/css/modules/tokens.css`
- `base.css`
- `layout.css`
- `header.css`
- `sidebar.css`
- `responsive.css`
- `frontend/index.html`
- `frontend/src/app/shell/`
- `frontend/src/ui/pageNavigation.ts`

Work:

- consolidate opaque surface, border, text, status, and spacing tokens;
- remove duplicated brand treatment;
- implement WorkspaceBar and grouped navigation;
- move utility actions into a command/overflow surface;
- replace the global workflow band with contextual recommendations;
- unify drawer/modal escape and focus behavior;
- achieve complete dark/light shell parity.

### Phase 2 — Shared page frame

Primary owners:

- `frontend/src/ui/`
- `frontend/src/ui/primitives/`
- `frontend/src/ui/composites/`
- `frontend/css/modules/toolbar.css`
- `chart.css`
- `controls.css`
- `page-help.css`

Work:

- implement PageHeader, ScopeBar, Inspector, RunAction, ResultFrame, ResultFooter, ContextBadge, and MetricStrip;
- migrate one reference page without compatibility duplicates;
- add state, keyboard, responsive, and theme characterization tests;
- add an architecture rule preventing new feature-specific toolbar frameworks.

Use Spectrogram as the first analysis-page migration because its existing hierarchy is closest to the target. Use Timeseries as the second migration because it exercises the complete component set.

### Phase 3 — Core workflow

1. Overview adaptive loaded/unloaded states.
2. Data source staged ingest and profile table.
3. Preparation full-page stage editor and materialization flow.
4. Signals scope bar, canvas tools, inspector, and result footer.

Do not keep old and new control surfaces visible at the same breakpoint. Compatibility may exist in code temporarily, but the user should see one canonical owner.

### Phase 4 — Consolidated exploration workspaces

1. Relationships tabs backed by current Correlations and Scatter modules.
2. Shared pair and filter context.
3. Spectrum tabs backed by current FFT and Spectrogram modules.
4. Shared signal/range and result-metadata contract.

Preserve deep links and browser history. A current `#page=scatter` link should open Relationships → Pair plot; `#page=fft` should open Spectrum → Spectrum.

### Phase 5 — Diagnostic workspaces

1. Causality setup/run/result layout.
2. Drift scope/inspector/result-tab layout.
3. Shared run history and provenance presentation where supported.
4. Full error, cancellation, stale-result, and high-workload states.

### Phase 6 — Polish and retirement

- retire duplicated toolbar and responsive proxy markup;
- remove obsolete page-specific concealment selectors;
- ensure Settings controls every live option and no inert settings remain;
- update user documentation and screenshots;
- complete all-page ETTm2 verification;
- verify packaged assets and bundle budgets.

## 16. Verification plan

### 16.1 Task-based usability checks

Test with engineers who have not worked on the frontend implementation.

1. Load ETTm2 and identify its time span, cadence, row count, and active revision.
2. Plot three signals and restrict the range to a one-week interval.
3. Add a numeric filter and verify it is active on Relationships.
4. Find a high-correlation pair and inspect its density plot.
5. Identify the strongest non-zero spectral peak and its reciprocal period.
6. Run causal discovery and explain which parameters produced the graph.
7. Run drift analysis against the first 50% baseline and locate the most severe window.
8. Add a reversible preparation stage, preview its impact, and return to the source baseline.
9. Export a result and state whether it represents source, working, filtered, or visible data.

Success means users do not need page help to identify current scope or the next action. Help remains the route to method explanation, not basic interface decoding.

### 16.2 Automated gates

- Focused Vitest for every migrated component and feature owner.
- `npm test`
- `npm run check:frontend:all`
- `npm run build`
- Playwright viewport sweep with root overflow and result-height assertions.
- Dark/light visual snapshots for shell, dropdown, modal, drawer, chart, table, empty, loading, error, stale, and success states.
- Keyboard-only navigation for sidebar, scope bar, inspector, tabs, dialogs, and result actions.
- Axe or equivalent accessibility scan, followed by manual chart and focus review.

### 16.3 Visual acceptance criteria

- No more than two horizontal control regions before an analysis result: page header and scope bar.
- One visually dominant primary action per state.
- No nested outlined card styling for ordinary toolbar groups.
- Dataset/revision and active scope are visible or one click away on every page.
- Secondary controls use one inspector pattern.
- Dark and light themes cover the full visible page.
- Page titles are visually stronger than toolbar labels.
- Chart data colors are not reused as shell state colors.

## 17. Success measures

Track before and after values where practical.

| Measure | Target |
|---|---|
| Time from launch to first useful three-series plot | ≤60 s for a new user with sample data |
| Time to identify active dataset/range/filter state | ≤5 s on any analysis page |
| Visible primary controls before result | ≤7 controls for each default analysis state |
| Desktop result area at 1440×900 | ≥65% of content area on chart pages |
| Phone result height at 414×896 | ≥300 px |
| Duplicate user-facing controls | 0 at any single viewport/state |
| Unlabeled icon-only domain actions | 0 |
| Theme-incomplete regions | 0 |
| Pages using shared ResultFrame/Inspector contract | 100% of analysis pages |

Qualitative target: users describe the app as focused, precise, trustworthy, and fast—not merely “dark,” “technical,” or “feature-rich.”

## 18. Non-goals

- Rewriting the frontend in React, Vue, or another framework.
- Introducing Tailwind, Sass, CSS-in-JS, Bootstrap, Material UI, shadcn, or a component library.
- Changing backend analytical semantics as part of visual migration.
- Replacing ChartGPU or ECharts solely for appearance.
- Hiding expert controls permanently.
- Turning EdaTime into a general BI dashboard builder.
- Adding collaboration, accounts, or cloud services to justify the new shell.
- Preserving duplicate controls indefinitely for compatibility.

## 19. Key design decisions

1. **Signal Studio is the primary visual identity.** It combines a modern editorial composition and a restrained spectral signature with the discipline of a technical instrument.
2. **Professional means calm and explicit, not monochrome and minimal.** Dense analytical results remain; excessive control chrome is reduced.
3. **The dataset is the workspace identity.** Product branding becomes quieter after launch.
4. **Context becomes persistent and actionable.** The existing Analysis Context content is promoted into the workspace model.
5. **Related views become tabs, not unrelated destinations.** Relationships and Spectrum reduce navigation and preserve analytical continuity.
6. **The inspector is the main simplification mechanism.** Controls are reorganized, not removed.
7. **Preparation is a first-class workflow.** Reversibility, versions, and materialization remain visible and trustworthy.
8. **The current responsive repair is a foundation.** The redesign must not regress its overflow, touch, focus, or chart-height contracts.
9. **Implementation remains plain TypeScript and CSS.** The new design system should strengthen existing architecture rather than replace it.

## 20. Definition of done

The redesign is complete when the visible information architecture matches the user’s analytical workflow; every page shares the orientation/scope/result/inspector model; active dataset, revision, range, filters, and preparation state are unambiguous; default views expose only the parameters needed to begin; expert controls remain discoverable; result states are consistent; dark and light themes are complete; all existing responsive and accessibility contracts pass; and the old duplicated toolbar, workflow-band, and page-specific disclosure systems have been retired rather than layered underneath the new interface.
