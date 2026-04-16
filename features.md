Proposed New Features
Anomaly detection overlay — Apply lightweight unsupervised anomaly detection (Z-score, IQR, Isolation Forest via Rust) on the time-series data and render flagged regions as semi-transparent overlays on the main chart. High value, visually impactful.

Column correlation heatmap — Beyond scatter pairwise view, render a full NxN correlation matrix as a color-coded heatmap tile view. Quick overview for wide schemas.

Rolling statistics bands — Add rolling mean, ±1σ, and ±2σ envelope bands as optional overlays on the time-series chart. Common EDA workflow.

Bookmarkable views / shareable URLs — Encode current viewport, selected columns, filters, and chart text into URL hash or query params. Allows sharing specific views without server state.

Multi-file session support — Support loading multiple CSV/Parquet files as separate "datasets" with a dataset switcher in the UI, keeping them in-memory simultaneously.

Streaming/incremental data append — WebSocket or SSE endpoint for appending new data rows to the live dataset without full re-upload. Useful for monitoring scenarios.

Column transformation expressions — Allow users to define derived columns (e.g., col_a / col_b, log(col_a)) from the UI, computed lazily via Polars expressions. Avoids pre-processing outside the tool.

Frequency-domain view — FFT/PSD of selected time-series columns as an optional view tab. Extremely useful for sensor data and signal analysis.

Export to Jupyter notebook — Generate a .ipynb file with the current dataset path, selected columns, filters, and visualization code (using Polars + Plotly) pre-filled.

Dark/light theme toggle — The CSS is already modular; add a :root variable-based light theme and a toggle in the header