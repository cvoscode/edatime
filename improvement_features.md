# Improvement Ledger

## Open

### High Impact / Low Effort

- Guard linked scatter requests against invalid time windows before sending them. The frontend currently forwards finite `start` and `end` values without verifying `start < end`, which produces a `400 invalid_time_range` on reload when linked range state is stale or hydrates out of order.

- Align the heatmap drill-down with the stated analysis workflow. The current heatmap sends users to Causal on cell click, but the product copy and the natural screening flow point toward Scatter as the first drill-down target for a strong correlation.

### Medium Impact / Low Effort

- Align onboarding docs with the actual landing page. The router defaults to `home`, but the quickstart and user manual still say the app opens on Upload by default, and the docs do not describe the Home page at all.

- Fix the select-chevron CSP violation. The controls stylesheet uses a `data:` URL for the custom select arrow, but the server CSP does not allow image data URIs, so every page load emits a browser error and the custom arrow can be blocked.

- Exclude temporal columns from default correlation screening views, or render them in a clearly separate section. The current heatmap includes `ts` alongside numeric measures, which makes the matrix look broader but weakens the signal for actual variable screening.

- Seed the Timeseries page with a guided first step instead of a blank chart. For a fresh dataset, an analyst has to infer that the chips are the primary entry point; a suggested preset such as top variance or top correlation candidates would reduce first-run friction.

### Medium Impact / Medium Effort

- Add an in-app guided analysis workflow card or command-palette action that walks users from Upload to Timeseries, then Scatter, then screening pages. The existing features are strong, but the app currently assumes the user already knows the intended order of operations.

## Draft Analyst Workflow

1. Start on Upload and verify the detected time column, row count, numeric columns, and obvious distribution issues in the profile grid before changing anything.

2. Open Timeseries and begin with 2 to 3 operationally important series rather than enabling everything. For the current fixture, `HUFL`, `HULL`, and `OT` are a sensible first pass because they show strong shared movement and make the first chart legible.

3. Use Timeseries to establish baseline structure first: trend, co-movement, unusual windows, and whether bands or anomaly overlays surface intervals worth isolating.

4. Move to Heatmap or Matrix to screen the full schema quickly. Use this step to identify strong candidate pairs and to separate obviously unrelated variables from variables worth deeper inspection.

5. Drill into Scatter for the strongest pairs, ideally with the current chart range linked only after the time window is known to be valid. Use color-by only after the base X/Y relationship is understandable.

6. Check Distributions to validate whether the scatter shape is being driven by skew, clipping, outliers, or multimodality rather than a stable relationship.

7. Use FFT and Spectrogram only after the time-domain view suggests periodic structure. These pages are most useful once a candidate column and interval have already been narrowed down.

8. Treat Causal as a late-stage hypothesis tool, not the first drill-down from broad correlation screening. Use it after selecting a small, plausible variable set from the earlier steps.

9. Export filtered data or session state once a useful subset or view has been established, so downstream analysis can reproduce the same window and filters.

## Completed

- None yet.