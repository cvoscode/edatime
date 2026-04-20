# EdaTime Documentation

```{raw} html
<section class="edatime-hero">
  <p class="edatime-eyebrow">Time-Series Analytics Documentation</p>
  <h1>Explore faster. Build confidently.</h1>
  <p>
    EdaTime combines a Rust/Axum/Polars backend with a vanilla-JS frontend and GPU-accelerated
    rendering. This documentation covers both the end-user workflows and the developer-facing
    architecture, API surface, and local development tooling.
  </p>
  <div class="edatime-pill-list">
    <span class="edatime-pill">Upload-first workflow</span>
    <span class="edatime-pill">Arrow IPC transport</span>
    <span class="edatime-pill">Scatter, FFT, Spectrogram, Causal</span>
    <span class="edatime-pill">Sphinx + Read the Docs</span>
  </div>
</section>
```

::::{grid} 1 1 2 2
:gutter: 3

:::{grid-item-card} Quickstart
:link: quickstart
:link-type: doc
:class-card: edatime-card

Get from server startup to your first chart, scatter plot, and export with the current Upload-first default workflow.
:::

:::{grid-item-card} User Guide
:link: user/index
:link-type: doc
:class-card: edatime-card

Learn the UI page by page: Upload, Timeseries, Scatter, Matrix, Distributions, FFT, Heatmap, Spectrogram, and Causal.
:::

:::{grid-item-card} Developer Guide
:link: developer/index
:link-type: doc
:class-card: edatime-card

Understand the frontend module graph, backend routes, shared runtime state, build commands, and repository conventions.
:::

:::{grid-item-card} Reference
:link: reference/index
:link-type: doc
:class-card: edatime-card

Jump straight to API routes, configuration knobs, and route families available under `/api` and `/api/v1`.
:::

::::

## Documentation Map

This docs site is split into three tracks:

- Quickstart for first-run guidance and the expected analysis flow.
- User docs for practical operation of the app itself.
- Developer docs for architecture, source layout, routes, build commands, and extension points.

```{toctree}
:hidden:
:maxdepth: 2

quickstart
user/index
developer/index
reference/index
```