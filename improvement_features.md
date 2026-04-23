Feature: Replace modal with inline panel — embed a collapsible “Distribution Over Time” panel on the Distributions page (not a separate modal). The panel is visible for the currently selected column(s) and can be toggled open/closed.

Groupings: Support week, weekend, month, quarter, year, and windowed (N chronological windows). Grouping semantics:

week: ISO week buckets.
weekend: Saturday+Sunday vs weekday buckets (or sliding weekend grouping when appropriate).
month, quarter, year: calendar-aligned buckets.
windowed: split the selected time range into N contiguous time windows (configurable windows).
Groups are ordered chronologically; each group must include start/end timestamps and sample count.
Visualization modes:

Histogram overlay: semi-transparent histograms per group (color-coded, same bin edges across groups).
Normalized density / KDE: optional normalized view (area = 1) and KDE overlay.
ECDF: toggle to show ECDF overlays instead of or in addition to histograms.
Small multiples: option to switch to stacked small-multiple histograms for better per-group inspection.
Show per-group summary stats (n, mean, median, min, max, IQR) in the panel and annotate sample counts on the plot.
Bins & scaling:

Use consistent global bin edges across groups (user-configurable bins) so overlays are comparable.
Allow normalize flag to compare relative densities instead of raw counts.
Provide sensible defaults (e.g., bins=24, windows=20) and allow user overrides.
Drift detection (statistics):

Run two-sample tests comparing early vs later groups (configurable: first vs last, adjacent windows, or all pairs):
Epps–Singleton test (Epps–Singleton) — report test statistic and p-value.
Kolmogorov–Smirnov two-sample test (KS) — report D-statistic and p-value.
Return effect-size indicators and a boolean “significant” using a configurable alpha (default 0.05).
Provide per-comparison results plus a concise “drift summary” string in the UI (e.g., “Mean ↑ from 3.2 → 5.1; KS p=0.0002 (significant)”; E-S p=0.001).
For multi-group comparisons, aggregate suggestions (e.g., first vs last) and allow the user to inspect pairwise results.
Singletons & small-sample handling:

Define a minimum sample threshold (e.g., min_samples = 5) below which statistical tests are not run and are reported as insufficient data.
For singleton groups (n == 1), do not run parametric two-sample tests; instead:
Report sample count and mark test result as insufficient.
Optionally provide a bootstrap/resampling fallback when the user explicitly requests robust inference (computationally optional).
Ensure visualizations render even with singleton groups (show a tick or bar with annotated count).
API contract (example):

Request: GET /api/analytics/time_distributions?start=<ISO>&end=<ISO>&columns=a,b&windows=20&bins=24&group_by=month|week|weekend|quarter|year|windowed&overlay=histogram|ecdf&normalize=true
Response shape (per column):
[columns: [{ name, windows: [{ window_start_ms, window_end_ms, n, bin_edges, counts, mean, median }], global_min, global_max, bins, tests: { comparisons: [{ groupA_index, groupB_index, ks: {stat, p}, epps: {stat, p}, significant: bool }] }, metadata }]](http://vscodecontentref/11)
Include explicit insufficient_data flags per comparison/group.
Edge cases & robustness:

Drop or ignore non-finite values; report number of dropped points.
Respect the time column timezone (or document that grouping is performed in UTC).
Ensure behavior is defined for sparse datasets and for groups with widely different sizes.
Provide server-side limits to avoid expensive fallback tests unless requested.
UI controls & UX:

On the Distributions page panel, expose:
Group by select (week, weekend, month, quarter, year, windowed)
Windows input (enabled only for windowed)
Bins input
Overlay mode select (Histogram / ECDF / KDE / Small multiples)
Normalize checkbox
Compare button (runs tests and updates drift summary)
Export buttons (CSV/JSON) for raw per-group bins and test results
Show a compact “drift summary” at panel top and link to detailed pairwise test results below.
Acceptance criteria:

The panel is embedded on the Distributions page (no modal).
Grouping calculations match calendar semantics above and are covered by unit tests.
Bins are consistent across groups and the overlay/ECDF modes render properly.
Epps–Singleton and KS tests run for valid comparisons and return stat, p, and significant.
Singleton / insufficient groups do not crash the UI; tests are skipped with clear user-facing notices.
Backend tests verifying grouping logic and test outcomes are added (unit tests); frontend integration shows correct summary and detailed test output.
Optional / future:

Add a “pairwise heatmap” of p-values for all group pairs.
Add bootstrap-based effect size estimates for low-N groups on-demand.

---

# Full-Stack Audit Improvements — April 22, 2026

**Audit Scope:** Performance, Drift Page Implementation, UI/UX, Backend Architecture  
**Overall Status:** Production-ready with minor improvements needed

## High Priority

### H1: Add drift result export functionality
- **Issue:** Users cannot save or export drift analysis results
- **Impact:** High — limits practical utility of drift analysis
- **Effort:** Medium
- **Status:** 🔴 Open

**Implementation Tasks:**
- Add PNG/SVG export buttons for timeline and detail canvases
- Add CSV export for drift statistics (per-window stats + thresholds)
- Add JSON export for full drift response
- Wire up to existing export button pattern from other pages
- Add export keyboard shortcuts (e.g., `Ctrl+E` when on drift page)

**Files to modify:**
- `frontend/src/drift/driftPage.ts` — Add export handlers
- `frontend/index.html` — Add export buttons to drift toolbar
- `frontend/css/modules/drift.css` — Style export controls

**Acceptance Criteria:**
- [ ] PNG export captures timeline canvas at full resolution
- [ ] SVG export produces scalable vector of timeline chart
- [ ] CSV export includes all window stats (timestamp, count, mean, std, KS, Wasserstein, PSI, drift_level)
- [ ] JSON export matches API response shape
- [ ] Export buttons follow existing toolbar styling
- [ ] Exports work for both reference and selected window detail views

---

### H2: Add unit tests for drift functions
- **Issue:** No test coverage for drift-specific computations
- **Impact:** Medium — risk of regressions in statistical tests
- **Effort:** Medium
- **Status:** 🔴 Open

**Implementation Tasks:**
- Add tests for `compute_temporal_drift()` in `tests/unit_tests.rs`
- Add tests for KS test, Wasserstein distance, PSI functions
- Add integration test for `POST /api/drift/stats` endpoint
- Add frontend tests for drift page rendering in `frontend/src/drift/driftPage.test.ts`

**Test Cases to Cover:**
- [ ] Reference window with sufficient samples (≥5)
- [ ] Reference window with insufficient samples (<5) → error
- [ ] Empty monitoring range → empty windows array
- [ ] Single window → correct drift calculation
- [ ] Multiple windows → correct iteration and drift levels
- [ ] KS test: identical distributions → p-value ≈ 1.0
- [ ] KS test: different distributions → p-value ≈ 0.0
- [ ] Wasserstein distance: identical → 0.0
- [ ] PSI: no drift → < 0.1, minor drift → 0.1-0.2, major drift → > 0.2
- [ ] Low-sample windows → drift_level handling
- [ ] API endpoint: valid request → 200 OK with correct shape
- [ ] API endpoint: invalid column → 400 error
- [ ] API endpoint: invalid date range → 400 error

**Files to modify:**
- `tests/unit_tests.rs` — Add drift module tests
- `tests/api_integration.rs` — Add drift endpoint integration test
- `frontend/src/drift/driftPage.test.ts` — Add frontend rendering tests

---

## Medium Priority

### M1: Optimize drift computation performance
- **Issue:** Sort computation repeated per window (O(n log n) each)
- **Impact:** Medium — slow for datasets with >50 windows
- **Effort:** Low
- **Status:** 🟡 Open

**Implementation Tasks:**
- Pre-sort reference distribution once (already done ✅)
- Cache bin edges per column to avoid recomputation
- Consider incremental sorting for window distributions
- Add computation time metadata to response

**Files to modify:**
- `src/analytics.rs` — Optimize `compute_temporal_drift()`
- Add caching layer for bin edges (consider `src/cache.rs`)

**Acceptance Criteria:**
- [ ] Reference sorted only once
- [ ] Bin edges cached for repeated queries on same column
- [ ] Performance improvement: >30% faster for 50+ windows
- [ ] Response includes `computation_time_ms` metadata field

---

### M2: Add resize debouncing for drift canvases
- **Issue:** No debouncing on canvas resize causes multiple rapid re-renders
- **Impact:** Medium — janky resize on some devices
- **Effort:** Low
- **Status:** 🟡 Open

**Implementation Tasks:**
- Add 150ms debounce to ResizeObserver callback
- Use existing debounce utility or implement lightweight version
- Ensure cleanup on page unmount

**Files to modify:**
- `frontend/src/drift/driftPage.ts` — Add debounce to resize handler

**Acceptance Criteria:**
- [ ] Resize triggers single re-render after 150ms delay
- [ ] Rapid resize events don't cause excessive rendering
- [ ] No memory leaks (debounce timer cleared on cleanup)

---

### M3: Add keyboard shortcuts for drift page
- **Issue:** No drift-specific keyboard shortcuts documented or implemented
- **Impact:** Low — reduced accessibility and power-user efficiency
- **Effort:** Low
- **Status:** 🟡 Open

**Implementation Tasks:**
- Add `D` or `Enter` to trigger compute (when inputs valid)
- Add `E` for export (once export implemented)
- Add `R` to reset to initial view
- Document shortcuts in drift page UI or help panel
- Add shortcuts to main keyboard shortcut list

**Files to modify:**
- `frontend/src/drift/driftPage.ts` — Add keyboard event listener
- `frontend/index.html` — Add drift shortcuts to help panel
- `frontend/js/app.js` — Ensure drift page shortcuts don't conflict

**Acceptance Criteria:**
- [ ] `D` or `Enter` triggers compute (when focus not in input)
- [ ] `E` triggers export (after H1 implemented)
- [ ] Shortcuts documented in UI
- [ ] Shortcuts listed in main keyboard help panel

---

### M4: Fix compiler warnings
- **Issue:** 3 compiler warnings in causal/stats modules
- **Impact:** Trivial — code quality and CI cleanliness
- **Effort:** Trivial
- **Status:** 🟡 Open

**Warnings to Fix:**
1. Unused import: `ndarray::array` in `src/causal/independence.rs:1000`
2. Unnecessary `mut` on closure in `src/stats.rs:304`
3. Unused variable `total` in `src/stats.rs:334`

**Files to modify:**
- `src/causal/independence.rs` — Remove unused import
- `src/stats.rs` — Remove unnecessary `mut`, prefix unused variable with `_`

**Acceptance Criteria:**
- [ ] `cargo build` produces zero warnings
- [ ] `cargo clippy` produces zero warnings
- [ ] All tests still pass

---

## Low Priority / Enhancements

### L1: Custom scrollbar for drift window list
- **Issue:** Browser-default scrollbar inconsistent with app theme
- **Impact:** Trivial — visual polish
- **Effort:** Trivial
- **Status:** ⚪ Open

**Files to modify:**
- `frontend/css/modules/drift.css` — Add custom scrollbar styling

**Acceptance Criteria:**
- [ ] Scrollbar matches sidebar/custom scrollbar theme
- [ ] Works across browsers (Chrome, Firefox, Safari)

---

### L2: Add skeleton loading state for drift timeline
- **Issue:** Generic "Computing drift…" text during loading
- **Impact:** Low — UX improvement
- **Effort:** Low
- **Status:** ⚪ Open

**Files to modify:**
- `frontend/src/drift/driftPage.ts` — Add skeleton canvas placeholder
- `frontend/css/modules/drift.css` — Add skeleton animation styles

**Acceptance Criteria:**
- [ ] Skeleton canvas shows during computation
- [ ] Subtle pulsing animation
- [ ] Replaced smoothly when computation completes

---

### L3: Add metadata to drift response
- **Issue:** No computation time or debug metadata in response
- **Impact:** Trivial — debugging aid
- **Effort:** Trivial
- **Status:** ⚪ Open

**Files to modify:**
- `src/analytics.rs` — Add metadata fields to `DriftResponse`

**Response additions:**
```typescript
{
  // ... existing fields
  metadata: {
    computation_time_ms: number;
    num_windows: number;
    reference_samples: number;
  };
}
```

**Acceptance Criteria:**
- [ ] Response includes `computation_time_ms`
- [ ] Response includes `num_windows`
- [ ] Response includes `reference_samples`
- [ ] Frontend logs metadata to console in debug mode

---

### L4: Add Epps-Singleton test
- **Issue:** Feature spec requests Epps-Singleton test in addition to KS
- **Impact:** Medium — statistical completeness
- **Effort:** Medium
- **Status:** ⚪ Open

**Implementation Tasks:**
- Implement Epps-Singleton two-sample test in `src/analytics.rs`
- Add E-S test statistic and p-value to response
- Add E-S results to drift detail panel
- Update drift summary to include E-S p-value

**Files to modify:**
- `src/analytics.rs` — Add `epps_singleton_test()` function
- `src/analytics.rs` — Update `DriftWindowStats` to include E-S fields
- `frontend/src/drift/driftPage.ts` — Display E-S results
- `frontend/src/drift/driftPage.ts` — Update detail stats panel

**Acceptance Criteria:**
- [ ] Epps-Singleton test implemented correctly
- [ ] Test returns statistic and p-value
- [ ] Results displayed in drift detail panel
- [ ] Drift summary includes E-S p-value
- [ ] Tests added for E-S function

---

### L5: Pairwise drift comparison heatmap
- **Issue:** No visualization of p-values across all window pairs
- **Impact:** Low — advanced analytics feature
- **Effort:** High
- **Status:** ⚪ Future

**Implementation Tasks:**
- Compute pairwise comparisons (all window pairs)
- Generate heatmap matrix of p-values
- Add heatmap visualization to drift page
- Allow clicking heatmap cells to inspect specific comparison

**Acceptance Criteria:**
- [ ] Heatmap shows all pairwise window comparisons
- [ ] Color scale indicates significance level
- [ ] Clicking cell shows detailed comparison stats
- [ ] Exportable as PNG/CSV

---

### L6: Bootstrap resampling for low-N groups
- **Issue:** No robust inference for groups with low sample counts
- **Impact:** Low — statistical robustness for edge cases
- **Effort:** High
- **Status:** ⚪ Future

**Implementation Tasks:**
- Implement bootstrap resampling for low-N groups
- Add confidence intervals for drift statistics
- Make bootstrap optional (computationally expensive)
- Add UI toggle for "robust inference" mode

**Acceptance Criteria:**
- [ ] Bootstrap available for groups with N < 20
- [ ] Returns confidence intervals for KS, Wasserstein, PSI
- [ ] UI toggle to enable/disable bootstrap
- [ ] Clear indication when bootstrap used vs standard test

---

## Completed

### ✅ Drift Page Implementation (Base Feature)
- **Date Completed:** April 2026
- **Commit:** [ drift page implementation ]
- **Features Delivered:**
  - Temporal distribution analysis with configurable windows
  - KS test, Wasserstein distance, PSI computation
  - Canvas-based timeline visualization (box plot / violin modes)
  - Detail panel with ECDF/histogram overlay
  - Color-coded drift levels (green/yellow/red)
  - Interactive window selection
  - Low-sample warnings
  - Responsive layout

**Files Added:**
- `src/routes/drift.rs` — Drift endpoint handler
- `frontend/src/drift/driftPage.ts` — Drift page module
- `frontend/css/modules/drift.css` — Drift page styles

**Outstanding Work:**
- Export functionality (H1)
- Unit tests (H2)
- Performance optimizations (M1)
- Epps-Singleton test (L4)

---

## Summary

**Total Improvements Identified:** 12
- High Priority: 2 (Export, Tests)
- Medium Priority: 4 (Performance, Debounce, Shortcuts, Warnings)
- Low Priority: 6 (UI polish, metadata, advanced stats)

**Recommended Next Sprint:**
1. H1: Add drift export functionality
2. H2: Add unit tests for drift functions
3. M4: Fix compiler warnings (trivial, quick win)

**Backlog:**
- M1: Optimize drift computation
- M2: Add resize debouncing
- M3: Add keyboard shortcuts
- L1-L6: Enhancements and advanced features