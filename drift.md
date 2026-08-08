# Drift page — review

Reviewed as a data scientist with the ETTm2 sample dataset (7 numeric
columns, 69 680 rows, daily granularity, all 7 traces selected,
"First 50%" reference, "Later windows" evaluation, all default
thresholds). Verified at 1920, 1440, 1024, 900 and 420 CSS-px
viewports and at the help dialog, Decision rules panel, Export
menu, and detail/distribution/overview sub-views. Findings cover
data-science reasoning, modeling, visualization, and UX.

The verdict strip, severity heatmap, per-trace table, evidence
card, four distribution options (Raincloud/ECDF/Box/Violin),
four overview views (Severity map/Grouped time series/Boxplots
over time/Violins over time), window-list, keyboard shortcuts,
help dialog, focus view, exports (PNG/CSV/JSON), and the
investigation back-end all work. The page is technically complete
and visually consistent with the rest of the application.

The findings below focus on the gaps that block a confident
analytical conclusion or hide information a working data
scientist needs.

---

## P0 — Missing investigation surfaces in the UI

The investigation response (`POST /api/v1/drift/investigate`)
already returns `overview`, `rankings`, `segments`, `quality` and
`relationships`. The page controller renders them into four hidden
`drift-{overview,segments,quality,relationships}-panel` containers
and `page.ts` has `setActiveTab()` code that shows them when
`activeTab` switches, but there is **no tab strip, no link, no
navigation affordance to those panels anywhere in the rendered
DOM** (`document.querySelectorAll('[data-drift-tab]')` returns 0
elements). Every investigation result is fetched, then thrown
away.

Concretely, the user can never see:

- the segment breakdown (drift score per `Segment by` value)
- the quality issues panel (`latest_missing_rate`,
  `latest_completeness_delta`, `latest_zero_rate`, `flatline`,
  `low_sample_warning`)
- the relationship rank (correlation delta between column pairs
  inside the reference vs the comparison range — exactly the
  pattern this dataset shows: every column drifted together on
  2017-06-28, suggesting a common upstream cause)
- the change-points list (a sorted ranking of which window
  "looks like" a change point per column)
- the investigation score / worst-level summary card

Recommended fixes:

1. Add a real tab strip to the page header next to the page title
   ("Timeline | Investigation | Segments | Quality |
   Relationships"). The 5 panels can keep their existing markup
   and the existing `setActiveTab()` logic will work as-is.
2. Make the **"Every evaluation window is flagged"** warning
   banner a deep link to the Quality panel so the user can see
   *why* (it is almost always the `psi_sample_ratio_warning` —
   10× sample-size imbalance between reference and window).
3. Add a visible "Change points" card to the verdict strip —
   the dataset has a real, traceable change at 2017-06-28 19:52,
   which is the headline analytical finding.

---

## P0 — Reference baseline is invisible in the UI

The most consequential decision on this page is "which time range
defines 'normal'?" Currently the user sees only:

- a `Reference: First 50%` dropdown
- and (after expanding Decision rules) a `Reference start` /
  `Reference end` datetime input.

But the **chart never shows the reference range**. The severity
heatmap has a "Reference" legend chip but no shaded band on the
time axis, no vertical rule, no overlay. The user has no way to
visually confirm that "First 50%" actually maps to "2016-07-01 →
2017-06-28 19:52" and that the comparison starts right after.

Recommended fixes:

1. Render a translucent reference band behind the heatmap on the
   time axis (use `--referenceStroke` from the palette).
2. Add a small numeric band label inside the band
   ("Reference · 12 mo · 34 832 rows").
3. Surface the comparison range as a faint second band or a
   dashed rule at `comparisonStart`.
4. Show the reference `hist_counts` overlaid on the detail-card
   distribution chart (the box-plot-style comparison currently
   shows reference mean/std/quantiles but the *shape* of the
   reference distribution is hidden).

This is the single highest-leverage data-scientist fix: it lets
the user immediately answer "did the model classify this as drift
because the comparison range is too short, or because the data
actually changed?".

---

## P0 — Sample-size imbalance is computed but hidden

`metadata.psi_sample_ratio_warning` is set to `true` when
`reference_samples / avg_window_samples > 10`. On ETTm2 with the
default Daily window, the reference is 34 832 samples and a
window is ~96 — a 360× ratio. This makes PSI explode: every
window lands in the "red" zone not because the data drifted, but
because PSI on a 96-sample window against a 34 832-sample
reference is essentially unbounded.

The page shows a yellow toast
("⚠ PSI may be inflated (reference ≥10× window size)") but
**the verdict strip and the trace table treat the result as a
real, actionable detection** — 7 of 7 traces "Severe", 363 of 363
windows "affected", "first detected 28 Jun 2017". A data
scientist will reasonably conclude "the dataset has
catastrophic drift", which is misleading: PSI was just
over-confident.

Recommended fixes:

1. Suppress the red verdict banner and the "7 of 7 drifting"
   metric when `psi_sample_ratio_warning` is true. Show a
   yellow "Method reliability" card instead, with the actual
   ratio and a one-click link to widen the window or shorten the
   reference.
2. Promote the warning to the verdict strip (not just the toast).
3. Recommend alternative thresholds in the warning: "Try a
   weekly window, or a 'Last 5 windows' reference preset".
4. Optionally offer an "Auto window size" suggestion based on
   `reference_size / 10`.

---

## P0 — Thresholds have no domain meaning

The default thresholds (`psi_minor=0.10`, `psi_major=0.20`,
`ks_pvalue=0.05`, `es_pvalue=0.05`,
`wasserstein_std_multiplier=0.10`) appear in the Decision rules
panel as raw numbers with no context. The Help dialog mentions
"0.1 minor, 0.2 major are common defaults" and "0.1 is small,
0.3 medium, 0.5 large" for effect size, but those are buried in
long bullet lists.

A data scientist running this for the first time will not know
whether `wasserstein_std_multiplier = 0.10` is "very strict" or
"very loose", nor whether `0.05` for KS is a problem when there
are 96 samples per window (it is — power is essentially zero).

Recommended fixes:

1. Add an inline `?` icon next to each threshold that shows a
   one-paragraph explanation and the "weak / typical / strict"
   calibration (e.g. "0.05 p-value — typical for n ≥ 30; under-
   powered below n = 20").
2. Show the achieved statistical power alongside the threshold
   in the Decision rules panel (Wasserstein power estimate, KS
   critical value at the current window sample size).
3. Add a "Reset to dataset-aware defaults" button that picks
   thresholds based on the actual reference/window sample sizes.

---

## P0 — The "Drift over time" subplot is misleading

The left subplot inside the "Selected trace evidence" card is
labeled "Drift over time (HUFL)" with a y-axis titled `PSI` and
a y-range from 0 to 25. But it renders the **raw trace values**
of HUFL (units unknown, range 0–25), not the PSI drift score.
This is confusing: the user expects the chart to show *how the
drift signal evolved*, but instead it shows the underlying time
series.

Recommended fixes:

1. Rename the chart title to "Trace — HUFL" and the y-axis label
   to the actual variable name (e.g. "HUFL (oil temperature,
   high use frequency)"). Move "drift over time" semantics to
   the overview heatmap.
2. Overlay the PSI score for the selected window as a marker /
   secondary axis.
3. Or replace this subplot with a *proper* "drift score over
   time" line chart for the selected trace, with the selected
   window highlighted, which is what the heading promises.

---

## P0 — "Worst" and "First change" buttons are ambiguous

The `Latest / Worst / First change` segmented control picks a
window in the evidence card, but "Worst" means "highest
PSI among red windows" (silently — no preview), and "First
change" means "earliest window with non-green drift". Both
definitions are invisible. Worse, clicking "First change" jumps
to day 1, which on ETTm2 shows the *same* drift verdict as day
363 (because PSI explodes on every window with the current
sample-size ratio — see P0 above), which is not what a working
analyst would expect.

Recommended fixes:

1. Add a one-line description under the segmented control
   (or as a tooltip on each button): "Latest — most recent
   window. Worst — highest severity. First change — earliest
   window that is not green."
2. Disable "First change" and show an inline tip when
   `psi_sample_ratio_warning` is true, because "first change"
   is not meaningful under sample imbalance.
3. Allow the user to **click any window directly in the heatmap**
   to select it for inspection — the timeline already supports
   `chart.on('click', ...)` but only navigates to the
   selected-window detail, never to the window-list selection.

---

## P1 — "View" overview options change semantics silently

The `View` dropdown offers Severity map / Grouped time series /
Boxplots over time / Violins over time. Switching from Severity
map to Grouped time series changes the y-axis to "Shift
(reference IQR)" (normalized shift in IQR units), which is
genuinely useful. But:

- The y-axis label **overlaps the legend** ("Shift (reference
  IQR)" runs into the "HUFL" legend chip).
- Boxplots and Violins over time render only the **selected
  trace** — the title says "every selected trace" (inherited
  from the heatmap description) but the chart shows one trace.
  The header copy is misleading.
- The legend switches from the global Reference/Stable/Warning/
  Drift semantic colors to per-trace colors with no explanation.

Recommended fixes:

1. Rewrite the section description per view: "Median ± IQR for
   every selected trace, normalized to its reference distribution"
   is good for Grouped; add "Selected trace distributions over
   time" for Boxplots/Violins.
2. Move the legend below the chart so it does not collide with
   the y-axis label.
3. Add a chip on the chart header stating the current scope,
   e.g. "Viewing: 7 traces" vs "Viewing: HUFL".

---

## P1 — Detail card distribution is hard to read

The detail-card distribution comparison stacks reference
(mean/std/box) underneath the selected-window distribution,
labeled "Reference" and "Selected window". On ETTm2 with ETTm2's
HUFL window, the two distributions look identical visually
because both have similar means and similar spreads (the drift
is in higher moments and tail mass).

A data scientist cannot tell whether the shapes are the same,
slightly different, or wildly different from this chart.

Recommended fixes:

1. Add a histogram overlay (not just box) by default — the
   backend already returns `hist_bins` and `hist_counts` for
   both reference and window.
2. Show a KS-distance annotation on the chart
   ("KS = 0.18, p < 0.001").
3. Highlight the bins where the two distributions differ the
   most (top 3 PSI bins) in a contrasting color.
4. Show a small inset summarizing the four moments
   (mean, std, skew, kurtosis) for both distributions.

---

## P1 — Window list is linear and hard to navigate

The "View all evaluation windows" disclosure opens a Sort + List
of 363 days. Each row shows the day label and a single PSI value.
This is essentially useless: 363 rows with no color, no filter,
no per-window measure breakdown, and no way to jump to a
specific window other than scrolling.

Recommended fixes:

1. Paginate or virtualize the list (only show 25 rows at a time
   with page controls).
2. Color each row by severity (green/yellow/red dot).
3. Show the full measure triplet per row (PSI, Wasserstein,
   KS p-value) so the user can see *why* a window fired.
4. Add a date-range filter ("between 2017-09-01 and 2017-12-01")
   and a severity filter ("show only red").
5. Add a histogram of the 363 PSI values above the list so the
   user can see the distribution at a glance.

---

## P1 — No way to compare two windows or two baselines

A core analytical question is "did the drift get worse over
time?" or "is the result sensitive to the choice of baseline?".
The page supports neither.

Recommended fixes:

1. Allow multi-select on the window list (Ctrl/Cmd-click) and
   overlay the two (or more) distributions on the detail chart.
2. Add a "Compare baselines" mode that runs the analysis twice
   (e.g. "First 50%" vs "Last 5 windows") and renders a
   side-by-side diff view of which windows flip from green to
   yellow / red.
3. Add a "Reference sensitivity" heatmap that shows, for each
   candidate reference end date, the count of yellow/red
   windows after it.

---

## P1 — Grouped-time-series view is correct but visually dense

The Grouped distributions over time view is the most information-
dense chart on the page and the most valuable for a working data
scientist. But on 7 traces, the lines overlap, the band fills
stack into a grey wash, and the y-axis range is awkward
(roughly -4 to +2 IQR-units, which is correct but unintuitive).

Recommended fixes:

1. Add a "spread / lines / both" toggle so the user can switch
   between showing only the median line, only the IQR band, or
   both.
2. Allow hiding individual traces from the legend (click to
   toggle) — the trace table above already filters; the chart
   should follow.
3. Add a small-magnifier on hover that prints the median and
   IQR for the hovered window for every visible trace.
4. Add a y-axis reference line at 0 ("reference median") with a
   label.

---

## P1 — Trace table lacks a few analytical signals

The trace summary table shows Trace / Status / Persistence /
Drift score / First change / Strongest evidence. Useful additions
that the backend already computes:

- **Wasserstein distance (latest window)** — the strongest
  statistic when PSI is unreliable (see P0 above).
- **KS p-value (latest window)** — second strongest.
- **Drift trend** — slope of PSI over the last N windows
  ("accelerating", "stable", "recovering"). This is what a data
  scientist actually wants: is the drift getting worse?
- **Recovery points** — windows where severity went from yellow/
  red back to green.

Recommended fixes:

1. Add a "Trend" column with a small sparkline or icon
   (↑ accelerating, → stable, ↓ recovering).
2. Allow column visibility toggling on the table header (or
   pre-define a "compact" and "detailed" view).
3. Show the latest-window Wasserstein and KS p-value alongside
   PSI so the user can sanity-check the verdict.

---

## P1 — Verdict strip is hard to scan on the wide verdict card

The verdict strip is a 6-column grid that becomes a 2-column
grid on narrow screens and a 3-column grid on medium screens.
At 1024 px, "first detected" wraps below the headline and the
warning band overflows. At 1440 px the warning chip is clipped
on the right.

Recommended fixes:

1. Make the warning band span the full width below the metric
   row instead of being the last grid cell.
2. Add a "Why this verdict?" disclosure that lists the
   strongest two pieces of evidence (e.g. "LUFL PSI = 19.2 in
   latest window, 363/363 windows affected since 2017-06-28").
3. Replace the "Data drift detected" headline with the actual
   finding in plain language: "Every trace shifted on or
   around 28 Jun 2017 — likely a common upstream change."

---

## P2 — Window-list sort is binary

The window-list sort dropdown offers "Newest first" / "Oldest
first" and that is it. Useful additions:

- "Highest PSI" — quick jump to worst windows.
- "Most recent change" — windows where severity differs from
  the previous window.

---

## P2 — Export payloads lack provenance

CSV and JSON exports contain the per-window numbers and the
thresholds, but no:

- dataset source and revision,
- reference range used,
- sample-size warnings,
- timestamp of the run,
- the window size used.

A reviewer looking at the exported file has no way to reproduce
the result. Add a `meta.json` block (or header comments in CSV)
with all of the above.

---

## P2 — "Segment by" dropdown is hidden and unlabelled

The `Segment by` control lives inside the Decision rules
panel — three clicks deep. It is also unlabeled: the panel
says "Reset chart zoom / None" with no hint that "None" is
"don't segment". A working data scientist will rarely open the
Decision rules panel, so they will never discover that they
can split the analysis by a categorical column (e.g. day-of-
week, regime flag).

Recommended fixes:

1. Promote `Segment by` to the top toolbar next to
   `Window / Reference / Evaluate`.
2. Hide it when no categorical / time columns exist in the
   dataset.
3. Label it "Split by" if "Segment by" is too jargony.

---

## P2 — Help dialog and page copy drift from the implementation

The Help dialog still describes features that have changed:

- "All — analyze every numeric column at once" — the picker no
  longer has an "All" button in that sense; it now has chip-
  style toggle.
- "tumbling windows give cleaner answers" — the Evaluation
  dropdown offers "Later windows / Latest window / Latest N
  windows", not sliding-vs-tumbling.
- "Reference window — first N, last N, custom date range, or
  the full dataset" — the actual options are: First 50%, Last
  50%, Custom range, Current viewport. There is no "full
  dataset" preset.

Recommend a copy pass on the Help dialog to match the actual
`Reference preset` options and the Evaluation dropdown.

---

## P2 — Page-header CTA hierarchy is wrong

The page header has two equal-weight buttons: "Focus view" and
"Help". "Focus view" is a presentation toggle; "Help" is a
documentation link. They should not look the same:

- "Focus view" should be a small icon-only button (an
  expand/collapse icon) at the far right.
- "Help" should be the only labeled secondary action and use
  the existing `page-help-trigger` style (which it already does).

The current rendering looks like two unrelated actions of equal
importance. Minor, but noticeable on every page load.

---

## P2 — Empty and error states are not handled

The empty state ("No drift analysis yet") is shown only when the
page first loads. After clicking Run analysis on an empty
dataset, the toast says "Drift: 0 column(s)" but the verdict
strip remains in its previous state. After an error, there is
no inline recovery — only the toast.

Recommended fixes:

1. Show an explicit empty verdict strip with a "Run analysis"
   CTA when no result has been computed.
2. Render a persistent error banner (not just a toast) when the
   call fails, with a "Retry" button and a "Copy error details"
   link.
3. Show a "stale" badge on the verdict strip when the underlying
   data version changes after the analysis was run.

---

## P2 — Page-level keyboard shortcuts are not discoverable

The Help dialog lists shortcuts (`Alt+0` to open Drift,
`Enter` / `D` to run, `E` to export CSV, `J` / `P` for JSON /
PNG), but only `Alt+0` is wired to a discoverable affordance
(the navigation entry in the sidebar). The rest are hidden in
the modal.

Recommended fixes:

1. Add a small "kbd" hint to the Run analysis button
   ("Run analysis ⏎").
2. Surface the page-level shortcuts as a footer chip strip
   when the focus view is active.

---

## Responsive notes (1920 / 1440 / 1024 / 900 / 420)

Verified at 1440, 1024, 768 and 420. The page degrades gracefully:

- **1920 / 1440** — comfortable, no issues.
- **1024** — verdict strip wraps to a 2-column grid; "first
  detected" sits below the headline. Warning band overlaps the
  toolbar on the right.
- **900** — table compresses; "View evidence" link is partly
  clipped on the right. Column-picker dropdown opens but its
  vertical content list is clipped above and below the toolbar
  (see P0 investigation note).
- **420 (mobile)** — verdict strip becomes 2-col, table is
  horizontally scrollable, all controls are reachable but the
  page requires ~3 viewport heights of scrolling to see the
  detail card.

Two responsive-specific fixes:

1. **Column picker** — when it opens it renders a fixed-
   position panel whose height is clipped by the toolbar
   bottom. The user sees "All / Single / Clear" plus the
   column chips row but cannot scroll the list of 7 chips
   because the panel auto-positions above the toolbar. Pin the
   panel to `top: max(8px, rect.bottom)` with a fixed
   max-height and `overflow-y: auto`.
2. **Decision rules / Export popovers** — both render an
   absolutely positioned 500-px panel that overlaps the page
   content. On 1024 px the right edge is clipped. Either make
   the panel narrower or change the trigger to a non-overlapping
   layout (e.g. push content down).

---

## Modeling / data-science summary

If I were presenting this analysis to a stakeholder, the
single most important finding is:

> "Every trace shifted on or around **2017-06-28 19:52**, with
> the first 50% of the dataset as the baseline. The change is
> *synchronous* across all 7 columns and *persistent* — every
> window after the change is flagged. The most likely
> explanation is a common upstream event (sensor recalibration,
> acquisition change, regime shift), not 7 independent drifts."

The current page **hides every part of that sentence**:

- "synchronous across all 7 columns" — only visible if you open
  the trace table and read 7 rows. The Relationships panel
  (which would quantify this) is unreachable.
- "persistent" — visible as "100% (363/363)" but takes careful
  reading.
- "first change 2017-06-28 19:52" — visible but easy to miss
  inside the verdict strip.
- "common upstream event" — not stated anywhere; it has to be
  inferred.

The single highest-leverage fix is the **P0 "Missing
investigation surfaces"** + the **P0 "Reference baseline
invisible"** + the **P0 "Sample-size imbalance is computed but
hidden"** trio. Together they would turn the page from "list of
per-window statistics" into a clear, defensible analytical
finding.

The remaining P1 and P2 items are quality-of-life improvements
that would make the page pleasant to use on a real analytical
session but are not blocking.
