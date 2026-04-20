# Common Workflows

## Validate A Fresh Dataset

Use this when you want to sanity-check a new CSV, Parquet file, or database pull before deep analysis.

1. Start on Upload.
2. Review the profile grid and detected time range.
3. Confirm the inferred time column.
4. Load only a subset of columns if the schema is wide.
5. Open Timeseries and enable 2 to 4 key numeric series.

## Investigate A Relationship Between Two Variables

1. Open Timeseries.
2. Zoom to a suspicious or interesting interval.
3. Open Scatter with `Link chart range` enabled.
4. Pick `X` and `Y` columns.
5. Switch between `Density` and `Scatter` depending on point count.
6. Add a color column if a third variable may explain the pattern.
7. Open Distributions to inspect skew and spread for the same context.

## Screen A Wide Schema Quickly

Use the broadest-to-deepest path:

1. Heatmap for global correlation structure.
2. Matrix for pairwise shape and outliers.
3. Scatter for detailed drill-down on the strongest candidates.
4. Causal for lag-aware testing when simple correlation is not enough.

## Inspect Periodic Behavior

Use the spectral pages together:

1. Open FFT to compare dominant frequencies across series.
2. Open Spectrogram when the frequency content may shift over time.
3. Keep the same target column across both pages for easier interpretation.

## Safely Change The Dataset In Place

The Timeseries page contains dataset-changing actions such as transforms and outlier removal.

Recommended order:

1. Export or note the current context first.
2. Apply one transform or outlier rule at a time.
3. Re-check Upload and Timeseries after the change.
4. Revisit Scatter or Causal only after confirming the new dataset behaves as expected.