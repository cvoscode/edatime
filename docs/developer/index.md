# Frontend Pages — Documentation Index

This directory contains detailed page-by-page documentation for the EdaTime frontend, written to support a full rewrite of the application.

## Pages Documented

| # | Page | Route | File | Status |
|---|---|---|---|---|
| 1 | [Home](homepage.md) | `#page=home` | `homepage.md` | Complete |
| 2 | [Upload](upload-page.md) | `#page=upload` | `upload-page.md` | Complete |
| 3 | [Timeseries](timeseries-page.md) | `#page=timeseries` | `timeseries-page.md` | Complete |
| 4 | [Scatter](scatter-page.md) | `#page=scatter` | `scatter-page.md` | Complete |
| 5 | [Correlations/Heatmap](heatmap-page.md) | `#page=heatmap` | `heatmap-page.md` | Complete |
| 6 | [FFT / PSD](fft-page.md) | `#page=fft` | `fft-page.md` | Complete |
| 7 | [Spectrogram](spectrogram-page.md) | `#page=spectrogram` | `spectrogram-page.md` | Complete |
| 8 | [Causal Discovery](causal-page.md) | `#page=causal` | `causal-page.md` | Complete |
| 9 | [Drift Analysis](drift-page.md) | `#page=drift` | `drift-page.md` | Complete |
| 10 | [Settings](settings-page.md) | `#page=settings` | `settings-page.md` | Complete |

## Architecture Overview

See [architecture.md](architecture.md) for the overall system design, SPA shell, routing, state management, and cross-page communication patterns that apply across all pages.

## Cross-Cutting Concerns

### Shared Layout Elements
All pages share the same shell (`frontend/index.html`):
- **`#sidebar`** — left navigation with page buttons and `data-page` attributes
- **`#header-meta`** — dataset stats bar (row count, numeric series count)
- **`#workflow-panel`** — guided workflow banner (contextual to current page)
- **Analytics Drawer** — right-side collapsible panel with Rolling Bands and Anomaly Detection; present on all pages but rendered outside the page `<section>` and toggled via `hidden` attribute

### Shared CSS Modules
| Module | Purpose |
|---|---|
| `toolbar.css` | Toolbar layout, `.toolbar-group`, `.toolbar-label`, `.btn-toggle-group` |
| `chart.css` | Chart containers, empty states, loading overlays |
| `scatter.css` | Heatmap + scatter shared styles (`.scatter-inline-label`, `.toolbar-disclosure*`, `.plot-empty-state`) |
| `layout.css` | `.main`, `.app-content` |
| `buttons.css` | `.btn`, `.btn-ghost`, `.btn-primary`, `.btn-accent`, `.btn-sm` |
| `controls.css` | Overlay panels, drawer styles |
| `loading-indicator.css` | `.chart-loading-overlay`, `.chart-loading-spinner` |
| `modals.css` | Modal dialog base styles |
| `settings.css` | Settings modal specific styles |
| `drift.css` | Drift page specific layout and controls |

### State (appState)
All pages read/write `appState` from `frontend/src/state.ts`. Key fields:
- `selectedCols` — active column selection
- `currentStart` / `currentEnd` — time range
- `metadata` — dataset metadata (columns, time range, row count)
- `selectedColorColumn` — color-by column
- `rollingEnabled` / `rollingWindow` — rolling band settings
- `anomalyEnabled` / `anomalyMethod` / `anomalyThreshold` — anomaly detection
- `spectralFilterPreview` — FFT filter preview overlay on timeseries

### Cross-Page Events
All pages communicate via `CustomEvent` on `window` with namespace `edatime:`:
- `edatime:chart-range-change` — timeseries zoom/range change → scatter, heatmap, causal, drift respond
- `edatime:workflow-refresh` — workflow step completion
- `edatime:page-change` — navigation request
- `edatime:request-chart-range-reset` — empty state reset request
- `edatime:causal-progress` — progress updates during causal computation

### Routing
- Hash-based: `#page=PAGENAME`
- Pages are `<section class="page" id="page-{name}" data-page-name="{name}" hidden>`
- `showPage(name)` in `app.ts` removes `hidden` from target section, adds `hidden` to all others
- Default route: `home`

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `⌥1` | Upload page |
| `⌥2` | Timeseries page |
| `⌥3` | Scatter page |
| `⌥4` | Scatter matrix view |
| `⌥6` | FFT page |
| `⌥7` | Correlations/Heatmap |
| `⌥8` | Spectrogram page |
| `⌥9` | Causal page |
| `⌥0` | Drift page |
| `Ctrl+,` | Open settings modal |
| `Ctrl+K` | Command palette |
| `Ctrl+I` | Analysis context panel |
| `Shift+R` | Reset zoom (timeseries) |
| `Shift+Z` | Zoom out (timeseries) |
| `Shift+C` | Clear adaptive filters (timeseries) |
| `P` | Export chart as PNG (timeseries) |
| `E` | Export data as CSV (timeseries) |

## Complete HTML Copy

All page HTML sections are embedded in `frontend/index.html` (2051 lines). Each page has a corresponding complete HTML copy in its documentation file that can be used directly for recreation.

## Screenshots

Screenshots for all pages (empty state) are saved in `docs/screenshots/`:
- `home.png`
- `upload.png`
- `timeseries.png`
- `scatter.png`
- `heatmap.png`
- `fft.png`
- `spectrogram.png`
- `causal.png`
- `drift.png`
- `settings.png`