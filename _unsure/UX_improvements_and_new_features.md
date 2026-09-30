# UX improvements and new features

## Purpose

This document contains workflow and product ideas discovered during the page-by-page UI review with the ETTm2 sample dataset. They are intentionally not part of the presentation-only redesign: each item would require new state, behavior, data, analysis, or route contracts.

The product goal is to help a data professional move from an unfamiliar time-series dataset to a trustworthy, prepared analysis dataset and a defensible visual finding.

## Recommended UX improvements

### P0 — Make analytical context persistent

Add a workspace bar that always shows:

- active dataset and source revision;
- row count, numeric-series count, time span, and cadence;
- active time range and whether it is full, zoomed, preset, or inherited;
- active numeric/adaptive filter counts;
- active preparation-stage count and materialization state;
- sampling or approximation warnings.

Each item should link to its owner. For example, `3 filters` opens filter details and `2 preparation stages` opens Preparation. This would remove the need to reconstruct result context from several pages and drawers.

### P0 — Give every result provenance

Charts, matrices, graphs, tables, and exports should share a result-details contract containing:

- dataset source and revision;
- source versus working dataset;
- selected columns and time range;
- filter and preparation-plan identity;
- method and important parameters;
- source rows versus rendered or sampled points;
- run timestamp, duration, and warnings.

The same summary should travel with exported images and data. A reviewer should be able to tell whether an artifact represents source, working, filtered, or visible data.

### P0 — Make Preparation the canonical pipeline owner

Evolve the full Preparation page into the primary stage editor and keep the global plan control as a shortcut to it. Recommended workflow:

1. Review quality findings.
2. Add, configure, enable, or reorder reversible stages.
3. Preview row, schema, cadence, and distribution impact.
4. Materialize as a clearly named new dataset version.
5. Return to the source baseline at any time.

The Pipeline Workbench should either become a focused editor within this page or a compact quick view. Two equally capable pipeline surfaces will remain difficult to learn.

### P1 — Consolidate related analysis routes

Keep current deep links but present related tools as workspaces with tabs:

- Relationships: Matrix, Pair plot, Distribution.
- Spectrum: Spectrum, Time-frequency.

Shared scope such as active signals, time range, and filters should remain visible when switching tabs. This would make the path from screening to detailed inspection feel deliberate rather than like unrelated page navigation.

### P1 — Use one secondary-settings inspector

Create one shared inspector pattern for expert method parameters, appearance, annotations, export, result details, and provenance. It should be pinnable on large screens, a drawer on tablets, and a bottom sheet on phones.

Scope-defining controls stay near the result. Presentation and export settings move into the inspector. Parameter changes that require recomputation should mark the existing result as stale instead of clearing it.

### P1 — Adapt Overview to dataset state

When no dataset is loaded, Overview should teach the three-step path: Load → Prepare → Explore.

When a dataset is loaded, replace the product introduction with:

- dataset identity, revision, shape, span, and cadence;
- quality summary;
- active preparation-plan summary;
- last-used workspace;
- one recommended next step;
- recent analysis runs or exports when history exists.

Sample datasets should move into a secondary `Switch dataset` disclosure after a dataset is active.

### P1 — Standardize run and stale-result behavior

Spectrogram, Causality, Drift, correlations, and other computed results should use the same states:

- ready to configure;
- ready to run;
- running with operation name and elapsed time;
- success with duration and parameter summary;
- empty result with a scoped recovery action;
- error with retry and technical details;
- stale result with a summary of what changed.

Keep the previous valid result visible when parameters change. Use `Update analysis` rather than clearing the canvas.

### P1 — Add analysis history and comparison

Allow users to save named analysis snapshots containing scope, parameters, and result metadata. Useful comparisons include:

- correlation method or scope comparisons;
- causal runs with different lag/test settings;
- drift baselines and threshold policies;
- spectrum results before and after preparation stages.

This should store compact result identity and parameters, not silently duplicate full datasets.

### P2 — Improve cross-page handoffs

Add explicit handoff actions that preserve scope:

- Matrix cell → Open pair plot.
- Pair plot → Inspect both signals over time.
- Spectrum peak → Mark the reciprocal period on Signals.
- Drift window → Open the same window on Signals and Relationships.
- Quality finding → Add a proposed Preparation stage.
- Preparation preview → Compare source and working distributions.

Every handoff should preview what state will carry over and provide a single action to clear inherited scope.

### P2 — Add a data-professional command menu

A command menu could combine navigation, recent views, current-scope actions, help, and keyboard discovery. Search terms should include domain synonyms such as `correlation`, `pair plot`, `PSD`, `missing values`, and `resample`.

This is a better long-term home for infrequent global actions than adding more permanent top-bar buttons.

## Missing visualizations and diagnostics

### P0 — Missingness and data-quality timeline

Show missing, non-finite, duplicate, and irregular-cadence intervals along time. Recommended views:

- row-by-column missingness heatmap;
- per-column quality bands over time;
- gap-duration histogram;
- duplicate and out-of-order timestamp markers.

This directly supports preparation decisions and should link findings to proposed reversible stages.

### P0 — Seasonal decomposition

Add STL or an equivalent decomposition into observed, trend, seasonal, and residual components. Include:

- explicit period and units;
- automatic-period suggestion as a suggestion, not a hidden default;
- robust mode;
- residual diagnostics;
- a handoff to create detrending or seasonal-adjustment preparation stages.

This is one of the most useful bridges between visual exploration and model-ready data.

### P0 — Autocorrelation and partial autocorrelation

Add ACF and PACF with confidence intervals, selected lag units, and effective sample size. These plots are standard for diagnosing memory, seasonality, and candidate forecasting lags.

The view should share signal, range, filters, and preparation context with Spectrum and Signals.

### P1 — Cross-correlation by lag

The current relationship views focus on contemporaneous association. Add a cross-correlation function that shows correlation across positive and negative lags, with clear direction language and optional first-difference mode.

Selecting a lag should hand off to a lagged pair plot and offer it as a candidate for causal analysis.

### P1 — Distribution comparison by window

Add side-by-side or overlaid distributions for two or more time windows:

- histogram and density overlay;
- ECDF;
- box or violin summary;
- ridgeline for multiple ordered windows;
- exact counts and filter context.

This would strengthen both Preparation previews and Drift investigation.

### P1 — Change-point timeline

Add a visualization for candidate mean, variance, trend, or distribution change points. The result should distinguish detection evidence from confirmed domain events and link selected segments to Signals, Drift, and Preparation.

### P1 — Rolling diagnostics workspace

Provide aligned small multiples for rolling mean, variance, quantiles, missing rate, and anomaly score. This is more interpretable than stacking every band onto the primary signal chart.

### P2 — Calendar and cadence heatmaps

For regularly sampled operational data, add hour-of-day × day-of-week and date × time-of-day heatmaps. These expose periodic operational regimes, missing acquisition windows, and schedule effects that are hard to see in a long line chart.

### P2 — Stationarity diagnostics

Combine rolling mean/variance with optional ADF/KPSS results and clearly state the assumptions and selected range. This should be a diagnostic surface, not an automatic transformation button.

### P2 — Multivariate profile overview

For wider datasets, add compact small multiples or a sortable profile table with sparkline, distribution, null rate, cardinality, range, and recent drift. This would help users choose relevant variables before opening a full chart.

## Product guardrails

- Preserve source data by default; preparation is reversible until explicit materialization.
- Keep UI accent color separate from chart data palettes.
- Never hide sampling, binning, filtering, or approximation that affects interpretation.
- Do not imply causation from lagged correlation or change-point certainty from a single method.
- Keep expert controls available, but make scope and the primary question understandable first.
- Preserve current URLs and export/API contracts when consolidating visible workspaces.
- Validate every new visualization on ETTm2, irregular data, missing/non-finite data, and very long time series.

## Further settings abstraction candidates

The new per-plot color-scale settings establish a useful boundary: presentation defaults belong in Settings, while analytical scope stays beside the result. The next preferences worth centralizing are:

- **Export presets:** default image format, pixel scale, transparent or theme-matched background, CSV delimiter, timestamp format, and whether exports include the active scope summary.
- **Number and time formatting:** timezone, timestamp display, decimal precision, engineering notation, and locale. These should apply consistently to axes, tooltips, tables, and exports.
- **Accessibility:** reduced motion, minimum chart contrast, color-vision-safe palette filtering, stronger focus indicators, and a text-pattern fallback for semantic colors.
- **Performance defaults:** point budget, downsampling strategy, matrix sample ceiling, and whether expensive analyses auto-run. The applied sampling decision must still be visible beside each result.
- **Annotation defaults:** drawing color, line width, note color, and whether a drawing tool resets after use.
- **Workspace startup:** initial page, sidebar state, restore-last-session behavior, and default Focus view state per analysis page.

Keep these controls local because they define the current question or change computation: selected columns, time range, filters, correlation method for the current result, spectral window and normalization, causal lags and significance thresholds, drift baseline, and preparation stages. Settings may provide defaults for those controls later, but the active value must remain visible beside the result and be included in exports.
