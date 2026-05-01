# Feature Ideas

Audit basis: page-by-page walkthrough on 2026-04-30 against the local app at `http://127.0.0.1:3001` using the sample dataset already loaded in memory.

## Home

- Add a `Recent datasets and sessions` strip so repeat users can reopen their last working context without stepping through the onboarding copy again.
- Add first-party `Sample datasets` cards with one-click launch into `Upload`, `Timeseries`, or `Correlations` so new users can benchmark the workflow without preparing a file.

## Upload

- Add background ingest jobs with progress, cancel, and `Open in ...` handoff actions so large imports no longer block the page.
- Add reusable import presets for time-column choice, selected columns, partial time range, and parsing options so recurring datasets can be loaded consistently.
- Add a preview diff mode that compares the candidate upload against the currently loaded dataset before the user replaces it.

## Timeseries

- Add computed-series formulas so users can create ratios, spreads, normalized signals, and rolling derivatives without leaving the app.
- Add small-multiple mode for selected columns so wide schemas can be inspected without overplotting everything into one chart.
- Add a saved-view system that stores named zoom windows, filter stacks, and annotation states as reusable analysis checkpoints.

## Correlations

- Add hierarchical clustering or block reordering for the matrix so related variable groups become visible faster than with raw column order.
- Add lag-aware correlation presets that can surface `lead/lag` candidates directly from the heatmap workflow before jumping into deeper analysis.
- Add a `Top pairs queue` that lets users send multiple interesting cells into Scatter for later review instead of navigating one pair at a time.

## Scatter

- Add lasso or rectangular brushing with `promote to filter` so users can turn visual point clusters into reusable numeric filters.
- Add fitted trend overlays such as linear regression, LOWESS, and residual view toggles for relationship diagnosis beyond raw point clouds.
- Add point-density-aware tooltips that summarize local neighborhoods when the plot is too dense for single-point inspection.

## FFT

- Add dominant-frequency and harmonic annotations so the page can explain what the strongest peaks mean instead of only plotting them.
- Add comparison presets for common bands or frequency windows to make multi-trace analysis faster.

## Spectrogram

- Add spectral event markers that let users bookmark transient bursts and jump back to the corresponding time window in Timeseries.
- Add overlap presets and cached compute profiles so repeated spectrogram runs on the same column feel more interactive.

## Causal

- Add constraint templates for common domain assumptions such as forbidden edges, known exogenous variables, or limited lag ranges.
- Add run comparison mode so users can diff two causal configurations and inspect which edges changed between methods or parameter sets.

## Drift

- Add baseline snapshot management so users can pin, label, and reuse reference windows across sessions.
- Add scheduled drift monitors with threshold presets and exportable reports for ongoing operational checks.

## Cross-Cutting

- Add a lightweight query inspector that shows the active dataset revision, filters, and recent API timings per page so power users can reason about cost while they work.
- Add a background jobs panel shared by Upload, Spectrogram, Causal, and Drift so long-running work has one consistent lifecycle across the app.
