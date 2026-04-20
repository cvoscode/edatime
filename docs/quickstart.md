# Quickstart

This guide assumes the repository is already checked out locally.

## Run The App

```bash
cargo run --bin edatime
```

Open <http://127.0.0.1:3000> in your browser.

The app now opens on the Upload page by default.

If the header later shows `Fallback renderer active`, the app is running without WebGPU acceleration. Upload and profiling still work, but you should verify GPU-heavy analysis pages again in a WebGPU-capable Chrome or Edge session.

## Load Or Confirm A Dataset

If sample data is already loaded, the Upload page acts as a dataset overview:

- check the detected time range
- inspect the profile grid
- confirm column types and distributions

If you want to replace the dataset:

1. Drag in a CSV or Parquet file.
2. Wait for the preview profile to populate.
3. Optionally adjust the row limit, skipped rows, time range, and selected columns.
4. Click `Upload & Ingest`.

After ingest, the app reloads and stays on the Upload page so you can verify the new dataset before navigating.

## Explore A Dataset In Five Minutes

1. Open Upload and check the preview/profile grid.
2. Open Timeseries and enable the most important numeric columns.
3. Zoom into a time window that looks interesting.
4. Open Scatter with linked range enabled and compare two columns.
5. Open Matrix or Heatmap to widen the search for related variables.
6. Use FFT or Spectrogram for periodic behavior.
7. Use Causal when you want to test lagged dependencies more explicitly.

## Useful Shortcuts

- `Alt+1`: Upload
- `Alt+2`: Timeseries
- `Alt+3`: Scatter
- `Alt+4`: Matrix
- `Alt+5`: Distributions
- `Alt+6`: FFT
- `Alt+7`: Heatmap
- `Alt+8`: Spectrogram
- `Alt+9`: Causal

## Next Steps

- Continue with the {doc}`user guide <user/index>` for the full UI walkthrough.
- Continue with the {doc}`FAQ <user/faq>` for operational edge cases and troubleshooting.
- Continue with the {doc}`developer guide <developer/index>` if you want to modify the app.