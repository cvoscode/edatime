# Time-Series Workflow Pages

This document describes what each visible page does in the current EdaTime workflow and when it should be used during a time-series analytics session.

Audit basis: live walkthrough on 2026-04-28 against `ETTm2.csv` at `http://127.0.0.1:3001`.

## Recommended workflow order

1. Home
2. Upload
3. Timeseries
4. Heatmap or Scatter Matrix
5. Scatter
6. Drift, FFT, or Spectrogram when a narrower question appears
7. Causal only after the variable set has been reduced

## Page roles

| Page | Workflow function | Use it when | Main hand-off |
| --- | --- | --- | --- |
| Home | Orientation and workflow entry. It explains the major analysis surfaces and shortcuts. | You are new to the dataset or need a reminder of what each page is for. | Move to Upload to ingest data or to a specific analysis page once the dataset is loaded. |
| Upload | Data ingestion, preview, and schema sanity check. It is the place to inspect detected time ranges, subset columns, and decide whether to partially load data. | You need to load a CSV/Parquet file, choose columns, or confirm that the time column was detected correctly. | Move to Timeseries once the dataset is loaded and the relevant columns are known. |
| Timeseries | Primary exploration surface. This is where baseline trend, seasonality, anomalies, overlays, filters, and plot styling are created. | You need to understand temporal shape, define the current time window, set local filters, or create the main plot. | Hand off the selected time window and filters to Heatmap, Scatter Matrix, Scatter, Drift, FFT, or Spectrogram. |
| Heatmap | Correlation screening across numeric columns. It quickly narrows the field of candidate relationships. | You want a fast pair-selection step before opening a detailed bivariate view. | Click a promising cell to open the selected pair in Scatter. |
| Scatter Matrix | Dense pairwise preview for a small set of linked columns. In the current implementation this is not a standalone DOM page; it is a matrix mode rendered on top of the Scatter surface. | You want to compare several pairwise relationships at once and drill into one of them. | Click a matrix cell to open the exact pair in Scatter detail mode. |
| Scatter | Detailed pairwise inspection with density or scatter rendering, linked time-range filtering, color-by, and summary statistics. | You already have an `X`/`Y` candidate pair and need shape, strength, density, and filter-aware inspection. | Promote a small plausible pair or variable set to Causal, or return to Timeseries to tighten the range/filter context. |
| FFT / PSD | Frequency-domain analysis for selected series over the current time slice. | You suspect periodic structure and need dominant frequencies or power distribution. | Return to Timeseries after identifying cycles, or compare related columns in Scatter/Matrix. |
| Spectrogram | Time-frequency analysis. It answers whether frequency content changes across time instead of only globally. | You suspect regime changes, transient events, or non-stationary periodic behavior. | Return to Timeseries or Drift to inspect the same suspicious windows more directly. |
| Drift | Windowed distribution-shift analysis against a reference period. | You need to compare current behavior against an earlier baseline and identify when distributions move. | Return to Timeseries for root-cause windows, or promote stable candidate columns into Causal if the shift suggests directional hypotheses. |
| Causal | Late-stage lag-aware hypothesis testing with Tigramite-based methods. It is the most specialized page and should not be the first discovery tool. | You already reduced the variable set and want to test plausible directional relationships with lags. | Export graph outputs or return to Scatter/Timeseries to simplify the input set further. |

## Practical notes from the audit

- The strongest core workflow today is `Upload -> Timeseries -> Heatmap/Scatter Matrix -> Scatter -> Causal`.
- `Timeseries` is the main plot-creation page; most other pages are downstream analytic lenses rather than peers.
- `Scatter Matrix` behaves like a Scatter sub-view, not a truly separate page. The current navigation still presents it as a first-class page.
- `Drift`, `FFT`, and `Spectrogram` are useful investigative side paths, but they are secondary to the core plot-building workflow.
- Heatmap cell click-through to Scatter worked correctly during the live walkthrough.
