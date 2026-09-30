# EdaTime improvements — data scientist review

**Review date:** 2026-09-28
**Dataset:** `ETTm2.csv`, active source `source-1` revision 1, 69,680 rows, 2016-07-01 00:00 through 2018-06-26 19:45 UTC, seven numeric series at an exact 15-minute cadence. The CSV has no null values or timestamp gaps.
**Evidence:** Running local API (`:3000`) and frontend reachability (`:5173`), the loaded sample, independent calculations from `ETTm2.csv`, and current frontend/backend source. Findings below say when a behavior was measured in the running API versus inferred from code. The existing uncommitted app changes were left untouched.

## What already works well

- The correlation matrix offers levels and first-difference views for Pearson, Spearman, and Kendall. This is especially useful for a time series: independent calculations show HUFL–MUFL Pearson changes from **0.200 on levels** to **0.833 on first differences**. The live correlation API returned 0.2004547 and 0.8331049, matching the CSV calculation.
- The spectral APIs return the effective sample cadence and reduction method. On the full range, Spectrum reports block-mean reduction from 69,680 to 8,192 points; Time-frequency reports reduction to 32,768 points. The frontend has sampling-context elements for both analyses.
- Drift checks its sample sizes before analysis. With this sample's default first-50%-of-time reference and daily monitoring windows, the live preflight correctly warns that the reference is **363 times** larger than the average monitoring window and marks the setup `decisionReady: false`.
- Preparation distinguishes immediate, sampled, and exact quality reports. Exact reports can surface long zero plateaus without silently treating zero as missing; the user has to decide their domain meaning.
- Pair plot code separates the full eligible population from rendered points and says in its accessible summary that plot sampling and hiding outliers do not change the reported correlations.

## Prioritized findings

| ID | Priority | Area | Finding | Evidence |
| --- | --- | --- | --- | --- |
| DS-1 | P1 | Data quality | The sampled report covers the first 10,000 rows only, so its ranges and zero prevalence can be seriously unrepresentative. | Live profile API + CSV + source |
| DS-2 | P1 | Causality | The default cap silently changes lag duration and omits the final 49 days of this dataset. | Live causal API + source + CSV |
| DS-3 | P1 | Time-frequency | The default `96 (1 day @ 15min)` window is about 51 hours on the full dataset after analysis downsampling. | Live spectrogram API + UI source |
| DS-4 | P1 | Drift | The default reference/window combination fails the app's own reliability preflight. | Live drift preflight + UI source |
| DS-5 | P1 | Causality help | The guide misstates the engine, method purpose, available tests, and meaning of causal p-values. | Frontend and backend source |
| DS-11 | P1 | Spectrum | The mode called PSD is squared FFT amplitude, without density normalization. | Live FFT API + backend/frontend source |
| DS-13 | P1 | Spectrum | Normalize/Clip affect plotted spectral values, while help says they preprocess the signal; log10 is described as dB. | Frontend source |
| DS-6 | P2 | Correlation | Pair suggestions do not name the active metric; the matrix returns coefficients without sample counts. | Live matrix API + frontend source |
| DS-7 | P2 | Quality workflow | Zero-heavy fields deserve an explicit “valid zero or sentinel?” decision before missing-value operations. | CSV + Preparation source |
| DS-8 | P2 | Spectrum | The full-range FFT cannot examine periods below about 4.25 hours at the default budget; the limit should be tied to the range and stated in period units. | Live FFT API + frontend source |
| DS-9 | P2 | Drift | Hundreds of windows multiply the number of significance checks, but the drift decision controls expose only unadjusted per-test p-value cutoffs. | UI/backend source; methodological risk |
| DS-12 | P2 | Spectrum | Mean-centering alone leaves the OT long-period trend ahead of its daily cycle in peak ranking. | Live FFT API + backend source |
| DS-14 | P2 | Accessibility | Drift declares tabs but uses toggle-button state and click-only behavior. | Frontend source; browser verification pending |
| DS-10 | P3 | Drift copy | The trace-picker hint says the first numeric trace is selected, while the code selects all seven numeric traces. | Frontend source |

### DS-1 — Make sampled quality reports representative and explicit

**Observed:** Starting `/api/v1/profile/sample` returned a ready `sample-v1` report of 10,000 rows. Its time range ended **2016-10-13 03:45 UTC**, while the loaded source ends **2018-06-26 19:45 UTC**. The backend intentionally applies `limit(10000)` to the source before profiling ([metadata.rs](crates/edatime-service/src/handlers/routes/metadata.rs)). This is the first contiguous 14.4% of rows, not a sample across the two years.

| Check | First 10,000 rows / sampled report | Full CSV |
| --- | ---: | ---: |
| OT minimum | 20.522 | -2.647 |
| HUFL maximum | 64.501 | 107.893 |
| HUFL zeros | 0 | 228 |
| HULL zeros | 82 (0.82%) | 15,389 (22.09%) |
| LULL zeros | 7,999 (79.99%) | 22,829 (32.76%) |

The UI labels these statistics as estimates, which helps, but does not disclose the first-rows method or the sampled date interval. Preparation also renders `10,000 source rows` for the sampled report, although the source has 69,680 rows ([prepare/index.ts](frontend/src/features/prepare/index.ts)). A scientist could accept the apparent lack of HUFL zeros or the sampled OT range as representative.

**Improve:** Sample across the entire time span, preserving early, middle, late, and rare-event coverage; report method, sampled interval(s), `10,000 / 69,680` coverage, and uncertainty/limits beside each estimate. Label the current method “first 10,000 rows” until changed. Keep the exact report as the authoritative option.

### DS-2 — Preserve time meaning in causal discovery

**Observed:** The Causality page requests `max_points: 5000` with no visible sample-size control ([workflow.ts](frontend/src/features/causal/workflow.ts)). The backend's causal extraction uses `step = floor(total_rows / max_points)`, then takes only 5,000 stepped rows ([shared.rs](crates/edatime-service/src/analytics/shared.rs)). For ETTm2, that means every **13th** 15-minute row: a lag of 1 is **3 hours 15 minutes**, not 15 minutes. The last sampled row is **2018-05-08 22:45 UTC**, leaving **4,692 rows / 48.9 days** out of the analysis. A live two-column PCMCI request returned links and p-values but no sample count, sampled end, or effective cadence.

The UI describes `τ max = 3` and edge lags in samples, without exposing that the backend changed what one sample means. Stepping can also alias short cycles and makes results on an unsorted or irregular time column especially hard to interpret.

**Improve:** Carry the actual timestamp axis through causal sampling; cover the entire requested interval, check sort order and cadence, and use a time-aware reduction strategy suitable for the chosen method. Show analyzed rows, start/end, effective cadence, and `τ` in both samples and duration *before* computation and on every graph/export. Allow a scientist to narrow the time range or raise the point budget when shorter lags matter. Treat the present results as exploratory conditional-dependence evidence, not a causal conclusion.

### DS-3 — Use effective cadence in time-frequency window labels

**Observed:** The selector says `96 (1 day @ 15min)` ([index.html](frontend/index.html)), which is correct only at source cadence. With the default full-range analysis budget of 32,768 points, the live spectrogram API reports `effective_cadence_ms = 1,913,818.359375` (about 31.90 minutes). The actual 96-point window is therefore **51.04 hours**, and the default 48-point hop is **25.52 hours**. The control's fixed “1 day” label misstates the time resolution of the displayed result.

**Improve:** Calculate and show the expected *effective* window and hop duration from the selected range and point budget before running. Update the selector labels after a result, and explain that shorter events will be blurred by the 51-hour window. Offer a shorter range or higher budget if the requested duration cannot be achieved. Keep the existing sampling-context badge, which correctly reports the reduction after computation.

### DS-4 — Make the default drift comparison decision-ready

**Observed:** The UI defaults to a reference of the first 50% of the timeline and daily monitoring windows ([index.html](frontend/index.html)). On this sample, the live preflight reports 34,840 valid reference rows, about 96 rows per daily window, a **363:1** size ratio, and `decisionReady: false`. It warns that PSI and KS may be unreliable. The warning is valuable, but a first click on the primary analysis action reaches a setup that the app itself advises against using.

**Improve:** Choose a preflight-valid default for the selected data, or offer a matched-size reference sample per monitoring window while retaining the long reference period's seasonal coverage. Show the expected ratio alongside the reference and window controls before `Run analysis`. Keep the preflight confirmation for deliberately imbalanced comparisons.

### DS-5 — Correct causal help and statistical claims

**Verified in source:** The help intro says “Causal discovery via Tigramite” and invites the user to test “does X cause Y … and how confident are we?” ([help.ts](frontend/src/features/causal/help.ts)). The server actually runs a **native Rust reimplementation** ([causal/mod.rs](crates/edatime-service/src/causal/mod.rs)). The guide calls LPCMCI suitable for non-stationary dynamics, while the method tooltip and backend describe its latent-confounding purpose. It recommends `gpdc` and a verbosity control that are absent from the current selector/toolbar. A p-value is not the probability that a causal edge is true; observational links also rely on assumptions about measured confounders, time order, stationarity, and the chosen test.

**Improve:** Rewrite help directly from current controls and implementation. Name the engine accurately, describe LPCMCI consistently, remove nonexistent controls, and explain assumptions and limits near the `Run discovery` action. Replace “confidence” and categorical “causal links” copy with qualified language such as “candidate directional lag relationships.” Report the actual sample coverage from DS-2 in results and exports.

### DS-6 — Add context to correlation suggestions and matrix values

**Observed:** The pair-suggestion label is `Suggested pairs (|corr| >= 0.70)` even though the queried metric comes from `defaultCorrelationMetric` and may be Pearson/Spearman on levels or changes ([correlationsPanel.ts](frontend/src/features/scatter/correlationsPanel.ts)). The matrix API returns only `columns` and a coefficient matrix; it returns no pairwise valid `n`, time range, or uncertainty field. The current loaded sample has no nulls, but these quantities become important after filters and preparation stages.

**Improve:** Name the actual metric and basis in every suggestion chip and rank label. Show pairwise valid `n`, source/working range, and excluded-row count in the matrix cell detail/export. Prefer a visible reminder that serial dependence and shared trend can produce strong associations. The existing levels/changes choice is useful; the sample illustrates why it should be prominent (HUFL–MUFL: 0.200 levels versus 0.833 changes).

### DS-7 — Make zero semantics a deliberate quality decision

**Observed:** The CSV has no nulls, but HULL contains **15,389 zeros (22.09%)** and LULL **22,829 (32.76%)**; the longest zero runs are 698 and 1,800 rows respectively (about 7.3 and 18.75 days at 15-minute cadence). Zero may be a real measured state or a missing/offline sentinel; the file alone cannot decide. Preparation flags long runs only for an exact profile ([zeroPlateauObservations.ts](frontend/src/features/prepare/zeroPlateauObservations.ts)). The early sampled report misses all HUFL zeros and understates HULL prevalence.

**Improve:** After the exact report, let users mark columns where zero is an allowed value, a suspected sentinel, or unresolved. Show how a proposed zero-as-missing rule would change valid counts, time gaps, correlations, spectra, and drift before applying it. Never convert zeros automatically.

### DS-8 — State the full-range FFT's frequency limit in familiar units

**Observed:** The live Spectrum API reduces this 69,680-row range to 8,192 block-mean points, with an effective cadence of **2.126 hours** and a Nyquist period of about **4.25 hours**. It still finds the roughly 24-hour OT cycle, but the result cannot resolve shorter cycles on that selected range. The app discloses source/effective cadence after computation; the analyst must infer the corresponding shortest resolvable period.

**Improve:** Show “shortest resolvable period ≈ 4.25 hours” with the sampling badge and while choosing the range. If the user wants a shorter period, offer a direct action to narrow the time range or change the budget. Keep exports explicit about the block-mean method and effective cadence.

### DS-9 — Account for repeated significance checks in drift

**Verified risk:** The default view can evaluate hundreds of windows for several traces. Drift exposes KS and Epps–Singleton p-value cutoffs of 0.05 for each window ([index.html](frontend/index.html)), and the result view shows those p-values alongside PSI and Wasserstein ([detailView.ts](frontend/src/features/drift/detailView.ts)). No multiple-comparison control is exposed in this workflow. Flags across many serially dependent windows can therefore be overread as independent evidence.

**Improve:** Show the number of tested trace/window comparisons and the decision family. Offer a false-discovery-rate option or a clear unadjusted label; prioritize effect size, persistence, and domain context over isolated small p-values. This is a methodological improvement, not a demonstrated false-positive bug in ETTm2.

### DS-10 — Align the drift trace-picker hint with the actual default

**Verified in source:** The hint says “first numeric trace by default,” but `bindDriftControls` initializes `selectedCols` from **all** numeric columns ([controls.ts](frontend/src/features/drift/controls.ts)). For ETTm2 that is seven traces. This changes the cost and interpretation of the first drift run.

**Improve:** Either select one trace as promised or change the hint to say all seven are selected and show the count before the run.

### DS-11 — Compute a true PSD or relabel the output

**Observed:** The backend applies a Hann window, computes magnitude = 2 × |FFT| / valid_count for interior bins, then sets psd = magnitude² ([fft.rs](crates/edatime-service/src/analytics/fft.rs)). A live 30-day OT query confirmed psd == magnitude² in every one of 1,441 returned bins. This is a squared-amplitude **power spectrum**, without the sample-rate and window-energy scaling needed for a power spectral *density* in signal²/Hz. The frontend calls the mode “PSD,” and its help says it can be integrated over a frequency band ([fft/help.ts](frontend/src/features/fft/help.ts)); that quantitative interpretation is unsafe. The magnitude is also uncorrected for the Hann window's coherent gain, so the “raw amplitude” help copy overstates absolute amplitude accuracy.

**Improve:** Either label the current values “squared amplitude / power spectrum” and remove the band-integration claim, or implement a documented one-sided PSD estimator with correct window-energy and frequency scaling. Test it on synthetic sinusoids and white noise, show units, and include the estimator/normalization in CSV exports and provenance. If absolute peak amplitude is intended, account for the Hann coherent gain separately.

### DS-12 — Offer detrending for cycle discovery

**Observed:** On the full ETTm2 range, the live OT FFT's largest returned peak is around **8,704 hours** (roughly one year); the approximately **24-hour** cycle is present but ranks below several long-period components. The backend subtracts the mean and applies a Hann window but has no trend-removal step ([fft.rs](crates/edatime-service/src/analytics/fft.rs)). The page goal is to find recurring cycles, and long-term trend can dominate that task.

**Improve:** Add an explicit detrend choice (for example none versus linear trend removal) and, when appropriate, a high-pass or seasonal-baseline workflow. Show preprocessing beside peaks and in exports so comparisons between runs remain reproducible. Do not silently remove the long-period component; it may itself be relevant.

### DS-13 — Separate spectral display scaling from signal preprocessing

**Verified in source:** Spectrum's Normalize and Clip controls call buildFftDataModel/applySpectralScale on the already returned FFT ordinates; changing them rerenders the chart without another FFT request ([fftDataModel.ts](frontend/src/chart/fftDataModel.ts), [fft/page.ts](frontend/src/features/fft/page.ts)). They do not normalize the input signal or suppress transient spikes before the transform. The help says those controls are pre-scaling applied before the FFT, and describes the log10 axis as decibels, although the renderer uses Math.log10 and labels the axis log10 ([fft/help.ts](frontend/src/features/fft/help.ts), [fftChartOptions.ts](frontend/src/chart/fftChartOptions.ts)). A scientist who turns on Clip to reduce time-domain outlier contamination will see a cleaner chart without changing the underlying peaks. CSV export also uses raw magnitudes/PSD rather than the displayed scaled values.

**Improve:** Label these controls “Display scaling” and “Clip plotted spectral values,” correct the help's log10/dB wording, and state that CSV contains raw output. If time-domain normalization or spike clipping is intended, add separate input-processing controls that change the API request and recompute peaks. Show both preprocessing and display settings in export provenance.

### DS-14 — Repair Drift tab semantics for keyboard and assistive technology

**Verified in source:** The Drift view switcher declares role=tablist and role=tab, but it stores state in aria-pressed rather than aria-selected, does not connect tabs to tabpanels with aria-controls/aria-labelledby, and only binds click handlers ([index.html](frontend/index.html), [drift/page.ts](frontend/src/features/drift/page.ts)). Native buttons remain reachable with Tab and can be activated with Enter/Space, but the declared tab pattern does not communicate selection as a tab set and does not implement arrow-key movement. Actual screen-reader behavior was not tested.

**Improve:** Either implement the tab pattern fully (aria-selected, tabpanel relationships, one tab stop with Left/Right/Home/End handling and visible focus) or present these as ordinary grouped buttons with aria-pressed and remove tab roles. Test with keyboard and a screen reader.

## Review coverage and limits

- Independently checked all 69,680 CSV rows for timestamp cadence, nulls, extrema, zeros, zero-run lengths, correlations, and FFT periods. The live API checks covered metadata, dataset versions, sampled profiling, correlation levels/changes, FFT, spectrogram, causal discovery, and drift preflight.
- I did not infer whether zero is valid or missing for this dataset; that requires domain knowledge.
- The requested VS Code browser could not be viewed or controlled through the tools exposed in this agent session, so no current screenshots or interactive frontend observations were obtained. Visual layout, actual keyboard/focus behavior, small-screen reflow, and screen-reader output remain unverified; source inspection alone cannot establish accessibility compliance.
