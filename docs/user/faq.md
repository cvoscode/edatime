# FAQ

## What data sources are supported today?

You can load CSV or Parquet files from the Upload page, or connect to PostgreSQL / TimescaleDB from the database section on that same page.

SQLite is not currently part of the implemented database ingest path.

## What happens when I upload a new file?

Uploading a file replaces the active in-memory dataset for the running server process.

After ingest, the app stays on the Upload page so you can immediately verify the detected schema, time range, and profile grid.

## Why does the Upload page sometimes show the current dataset profile even when no new file is selected?

The Upload page doubles as a profile browser for the dataset that is already loaded.

That is why you can see a populated profile table while the file drop zone still says no new file is selected.

## Why can the Upload page show `0/8 columns selected` while still listing all columns?

That counter belongs to the next upload preview selection state, not to the dataset that is already in memory.

The table itself can still show the current dataset profile even though no preview selection is active.

## Which actions change the dataset, and which only change the view?

These change the in-memory dataset:

- uploading a new file
- loading from the database
- `Transform…`
- `Outliers…`

These change only the current view or analysis context:

- zooming and resetting zoom
- series colors
- labels and drawings
- numeric range filters
- adaptive line filters
- Bands and Anomalies overlays
- scatter / matrix / distributions navigation

## Why do Scatter, Matrix, and Distributions keep affecting one another?

Those three routes share the same analytics workspace.

The current X column, Y column, color column, filters, and linked chart range are reused across them by design.

## Why are there no points in Scatter?

Check these in order:

1. Disable `Link chart range` temporarily.
2. Clear numeric range filters and adaptive line filters.
3. Re-open Timeseries and reset the zoom window.
4. Re-check the selected X and Y columns.

An empty or over-constrained time window is a common cause of apparently broken scatter queries.

## Why are there no correlation suggestions?

Suggestions are thresholded.

The current app uses a default absolute correlation threshold of `0.7`, so weak or moderate relationships are intentionally omitted from the quick-suggestion row.

## What does `Fallback renderer active` mean?

The main chart could not use WebGPU and fell back to a non-WebGPU rendering path.

Core upload and profiling flows still work, but GPU-oriented views should be verified again in a WebGPU-capable Chrome or Edge session before treating rendering behavior as final.

## Can I export filtered data instead of only screenshots?

Yes.

Timeseries and Scatter expose visual exports such as PNG and SVG, plus data exports such as CSV, JSON, and Parquet where implemented.