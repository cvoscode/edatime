# Frontend Architecture

## Entry Points And Build Outputs

The editable frontend source lives under `frontend/src/`.

The browser loads:

- `frontend/index.html`
- bundled JavaScript from `frontend/js/`
- static CSS from `frontend/css/`

The Node build step transpiles and bundles TypeScript from `frontend/src/` into the `frontend/js/` output consumed by the running app.

## Boot Sequence

`frontend/src/app.ts` is the orchestrator.

Its responsibilities include:

- initializing page navigation
- wiring the theme toggle and keyboard shortcuts
- initializing upload and profile UI
- loading metadata
- lazy-loading chart, scatter, FFT, heatmap, spectrogram, and causal modules
- building shared state used across pages

## Page Model

The app uses a single-page shell with hidden and visible page sections.

The page switcher lives in `frontend/src/ui/toolbar.ts`.

Important current behavior:

- the app opens on the Upload page by default
- ingest does not auto-navigate to another page after reload
- scatter, matrix, and distributions share the same underlying scatter page state

## Key Frontend Modules

### `ui/upload.ts`

Handles:

- drag-and-drop file input
- preview profiling
- partial load options
- database connect and load actions

### `ui/profile.ts`

Handles the virtualized column profile grid, sorting, selection counts, and filtering.

### `ui/columns.ts`

Handles:

- timeseries column chips
- color pickers
- adaptive target selection
- numeric filter chip rendering

### `ui/toolbar.ts`

Handles:

- page switching
- zoom controls
- chart exports
- drawing tools
- page-level analysis controls

### `scatter/`

This folder contains the scatter analytics subsystem:

- `scatterPage.ts`: orchestration and control binding
- `rendering.ts`: plot rendering, exports, colorbar, and overlays
- `matrix.ts`: scatter matrix view and FFT shortcuts
- `distributions.ts`: univariate cards and statistics
- `state.ts`: scatter-specific shared state

## Frontend Extension Guidelines

- If a new feature belongs to a single page, add it to that page module instead of app-wide state first.
- Reuse the shared toolbar and chip patterns where possible.
- Avoid unnecessary copies of typed-array data.
- Keep linkages between Timeseries and Scatter explicit through events or shared query builders.
- When you change static assets or bundled entry points, rebuild the frontend bundle.