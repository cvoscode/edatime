# Feature Ideas — Ranked by Impact

Ranked from highest user impact to lowest. Features marked ✅ have been implemented.
Last updated: 2025-07-25

---
## Tier 2 — High Impact (Next Priorities)

### 8. Causal Run Comparison

Side-by-side comparison of multiple causal runs with different parameters.

Comparison dimensions:
- method (PC, PCMCI, PCMCI+, LPCMCI)
- independence test
- tau max and alpha settings
- resulting edge set differences (added/removed/changed)

**Why:** Causal discovery is parameter-sensitive. Users need to see which edges are stable across settings.

### 9. Stronger Spectral Guidance

Presets and explanations for FFT and spectrogram analysis.

Additions:
- preset window sizes with plain-language descriptions ("for slow trends", "for fast oscillations")
- sampling-rate explanation and Nyquist warning
- dominant-frequency summary table
- peak labels on FFT chart
- option to filter out specific frequencies from underlying data

**Why:** Users know how to render the charts but not how to interpret or configure them.

### 10. Persistent Notes and Annotations

Extend chart drawing tools into a broader annotation system.

Features:
- named notes tied to time ranges
- saved callouts on scatter plots
- analysis bookmarks tied to dataset revisions
- annotation persistence across sessions (extends saved sessions)

**Why:** Collaborative interpretation still depends on outside tools. Inline annotations close the loop.

### 11. Guided Workflow Mode

Structured step-by-step analysis path: Upload → Timeseries → Correlations → Scatter Deep Dive → Causal.

Features:
- "Next step" suggestions after each page's analysis
- Scatter detail view accessible from scatter matrix cells
- Breadcrumb trail showing analysis progression
- Optional — can be skipped by experienced users

**Why:** The nine pages are powerful but lack guided connectivity for users new to time-series analysis.

### 12. Appearance and Layout Settings

Dedicated settings panel for visual preferences.

Options:
- theme (dark / light / auto)
- compact vs spacious layout
- default chart color palette
- default export format
- preferred correlation metric
- white-background export mode for presentations

**Why:** Power users benefit from setting preferences once instead of repeating small UI changes.

---

## Tier 3 — Medium Impact

### 13. Spectral Filtering

Apply frequency-domain filters to the time-series data.

Features:
- low-pass, high-pass, band-pass filter controls on FFT page
- preview filtered signal on the timeseries chart
- option to export filtered data

**Why:** Connects the spectral analysis back to the time domain for practical signal processing.

### 14. Distribution Comparison Mode

Compare distributions of the same column across different time ranges or filter conditions.

Features:
- split-view or overlay histograms
- KS-test / AD-test statistics
- before/after filtering comparison

**Why:** Distribution analysis is currently single-snapshot. Comparisons reveal regime changes and filter effects.

### 15. Multi-Dataset Support

Load and compare multiple datasets simultaneously.

Features:
- dataset selector in sidebar
- cross-dataset scatter and correlation
- dataset-scoped sessions

**Why:** Real-world analysis often involves comparing different experimental runs or data sources.

### 16. Derived Columns / Computed Features

Create new columns from expressions on existing ones.

Features:
- simple expression editor (column math, rolling aggregates, lag/lead)
- derived columns appear in all analysis pages
- persist in session state

**Why:** Avoids round-tripping to external tools for simple feature engineering.

### 17. Real-Time / Streaming Mode

Support appending new data to the in-memory dataset.

Features:
- WebSocket or SSE endpoint for live data
- auto-scrolling chart with configurable window
- live statistics updates

**Why:** Opens up monitoring use cases beyond post-hoc analysis.

### 18. Collaborative Annotations via Backend

Store annotations, sessions, and comparison results on the server.

Features:
- `/api/annotations` CRUD endpoints
- shared session links
- annotation sync across clients

**Why:** Moves from single-user to team-oriented analysis workflows.

### 19. Data Quality Dashboard

Dedicated page summarizing data quality metrics.

Features:
- missing value heatmap by column and time
- outlier summary per column
- duplicate row detection
- data freshness / staleness indicators

**Why:** Data quality is the first thing analysts check but currently requires manual inspection.




### pages that filter are connected so we can aggregate filters and export a polars-python pipeline based on it
- Keep linkages between all pages that can apply filter explicit through events or shared query builders.
- add the possibility to export the pipeline to so we can create a polars-python version for later use
