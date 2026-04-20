# Feature Ideas

These ideas are based on a manual walkthrough of the running app with the built-in dataset. They focus on user value, workflow speed, and reducing ambiguity in advanced analysis flows.

## High Value

### 1. Saved Analysis Sessions

Allow users to save and restore the full working state:

- active page
- selected series
- zoom window
- scatter X/Y/color choices
- matrix settings
- FFT and spectrogram settings
- causal settings and graph edits

Why it matters: the app already supports deep multi-page workflows, but the state is too rich to recreate manually each time.

### 2. Undo / Preview For Dataset-Changing Actions

Add a reversible workflow for:

- transforms
- outlier removal
- future row/column mutations

Good implementation options:

- preview affected row count before apply
- keep an operation history
- allow one-click revert to the previous dataset revision

Why it matters: these actions are analytically powerful but currently feel heavier than simple view changes.

### 3. Selection Table For Scatter And Timeseries

Add a data table panel for the currently selected or brushed subset.

Useful capabilities:

- list selected points or rows
- sort and filter inside the selection
- copy selected rows
- pin the selection as a named subset

Why it matters: charts show patterns well, but users often need the underlying records immediately after seeing something interesting.

### 4. Guided Workflow Mode

Add a lightweight assistant mode inside the app that suggests the next useful page or action.

Examples:

- after Heatmap: suggest strong pairs for Scatter
- after Scatter: suggest opening Distributions or Causal
- after Timeseries zoom: suggest linked Scatter refresh

Why it matters: the app now has many powerful pages, but new users can miss how well they chain together.

## Usability Improvements

### 5. Clearer Upload-State Separation

Improve the Upload page so it is always obvious whether the profile grid shows:

- the current in-memory dataset
- a staged file preview that has not been ingested yet

Possible additions:

- a prominent status badge
- separate tabs for `Current dataset` and `Staged upload preview`
- preselect-all behavior when previewing a new file

Why it matters: the current page is capable, but the distinction between current data and staged preview is easy to miss.

### 6. Global Help / Shortcut Palette

Add a built-in help overlay or command palette with:

- keyboard shortcuts
- page descriptions
- interaction hints such as `Ctrl+click` and double right-click behavior
- quick navigation by typing page or column names

Why it matters: several advanced interactions are discoverable only if you already know they exist.

### 7. Export Job Feedback

Add export feedback and a lightweight job history.

Useful details:

- success toast
- failed export reason
- last exported filename and format
- background progress for large Parquet exports

Why it matters: many export buttons exist, but long-running or failed exports need stronger user feedback.

### 8. Persistent Notes And Annotations

Extend the chart drawing tools into a broader annotation system:

- named notes tied to time ranges
- saved callouts on scatter plots
- analysis bookmarks tied to dataset revisions

Why it matters: the app is strong for exploration, but collaborative interpretation still depends on outside notes.

## Analytics Depth

### 9. Cross-Page Provenance Panel

Show the currently active analysis context in one place:

- dataset revision
- active time range
- numeric filters
- adaptive filters
- color encodings
- derived columns
- outlier rules applied

Why it matters: once users move through Timeseries, Scatter, Matrix, and Causal, it becomes harder to remember exactly what subset is being analyzed.

### 10. Causal Run Comparison

Allow side-by-side comparison of multiple causal runs with different parameters.

Comparison dimensions:

- method
- test
- tau max
- alpha settings
- resulting edge differences

Why it matters: causal discovery is highly parameter-sensitive, and users need a way to see which edges are stable across settings.

### 11. Stronger Spectral Guidance

Add presets and explanations for FFT and spectrogram analysis.

Helpful additions:

- preset window sizes with plain-language descriptions
- sampling-rate explanation
- dominant-frequency summaries
- peak labels and exportable peak tables

Why it matters: the spectral pages render correctly, but many users will not know how to choose parameters or interpret the result.

### 12. Correlation-To-Causal Bridge

Add a handoff from Heatmap or Scatter into Causal that pre-populates:

- selected variables
- suggested lag ranges
- suggested tests based on column types

Why it matters: the current pages are individually strong, but the transition from descriptive analysis to causal analysis could be much faster.

## Nice To Have

### 13. Shareable Report Builder

Let users assemble a lightweight report from current views:

- chart snapshots
- scatter screenshots
- selected statistics
- causal graph exports
- typed notes

Why it matters: many analyses end with a handoff to another person.

### 14. Smarter Suggestions Across Pages

Expand recommendation logic beyond scatter correlations.

Examples:

- suggest columns with strong spectral peaks
- suggest columns with changing variance over time
- suggest columns worth causal comparison after a selected time window

Why it matters: the app already has enough analysis surfaces to support intelligent routing, not just static navigation.

### 15. Appearance And Layout Settings

Add a dedicated settings panel for:

- theme
- compact vs spacious layout
- default chart palette
- default export format
- preferred correlation metric

Why it matters: power users will benefit from being able to tune the shell once instead of repeating small UI changes.
