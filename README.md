# edatime

`edatime` is a high-performance web application designed for fast, interactive exploratory data analysis (EDA) of large time-series datasets.

## Architecture

The project is built with a focus on speed and efficient memory usage across the entire stack:

- **Backend (Rust):**
  - **Framework:** [Axum](https://github.com/tokio-rs/axum) for a fast, async HTTP server.
  - **Data Processing:** [Polars](https://pola.rs/) for rapid ingestion and manipulation of CSV and Parquet files.
  - **Downsampling:** [minmaxlttb](https://crates.io/crates/minmaxlttb) (Largest Triangle Three Buckets algorithm) to intelligently reduce the number of data points sent to the client while preserving the visual shape of the time series.
  - **Serialization:** [Apache Arrow IPC](https://arrow.apache.org/) format is used to serialize the downsampled data efficiently for wire transfer.

- **Frontend (Vanilla HTML/JS/CSS):**
  - Uses the `chartgpu` library for WebGL-accelerated rendering of the time-series data.
  - Directly consumes Apache Arrow IPC data from the backend, avoiding expensive JSON parsing and enabling zero-copy data reads.

## Features

- **File Upload:** Upload large CSV or Parquet files containing time-series data.
- **Data Preview:** Preview the contents and schema of uploaded datasets before full processing.
- **Dynamic Downsampling:** The backend dynamically downsamples queries based on screen resolution to minimize payload size and improve rendering performance.
- **Responsive WebGL Charting:** Fluid zooming and panning powered by GPU-accelerated charting on the web.

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- Node.js & npm (for potential frontend dependencies)

### Running the App

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd edatime
    ```

2.  **Start the backend server:**
    ```bash
    cargo run
    ```
    This will start the Axum web server, typically on `http://127.0.0.1:3000`. By default, it will gracefully fallback to loading a `sample.csv` file if present, or start with an empty state.

3.  **Access the application:**
    Open your browser and navigate to `http://127.0.0.1:3000`. The frontend assets are served directly by the Axum server from the `frontend/` directory.

## File Structure overview

- `src/`: Rust backend source code.
  - `main.rs`: Entry point and Axum router setup.
  - `state.rs`: Application state holding the Polars DataFrame.
  - `routes/`: API endpoint handlers (`upload`, `data`, `metadata`, etc.).
  - `downsample.rs`: Integration with LTTB downsampling algorithms.
  - `arrow_export.rs`: Utilities for serializing dataframes to Arrow IPC.
- `frontend/`: Static assets for the web interface.
  - `index.html`: Main HTML document.
  - `js/app.js`: Application logic.
  - `js/chart.js`: Chart initialization and WebGL interaction.
  - `js/dataClient.js`: Handles fetching and parsing Arrow IPC data from the backend.
  - `libs/chartgpu/`: Local copy/build of the `chartgpu` library.
