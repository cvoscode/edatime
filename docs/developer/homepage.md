# Homepage Documentation

## Overview

The Homepage (`page-home`) is the default landing page of EdaTime. It serves as an orientation surface that helps new users understand the app's capabilities and provides quick entry points to the analysis workflow. It also offers one-click access to sample datasets for users who want to explore without preparing their own data.

## HTML Structure

```html
<section class="page page-home" id="page-home" data-page-name="home" hidden>
```

The page is divided into 6 main sections:

### 1. Hero Section

```html
<div class="home-hero">
  <div class="home-hero-icon">
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" ...>
      <polyline points="2,18 7,10 12,22 17,6 22,16 27,12 30,12" />
    </svg>
  </div>
  <h1 class="home-title">EdaTime</h1>
  <p class="home-tagline">Interactive time-series analytics — upload a CSV or Parquet, explore, and export.</p>
  <button class="btn btn-primary" type="button" data-home-nav="upload">
    Upload a file to get started
  </button>
</div>
```

**Purpose:** Hero section with branding, tagline, and primary call-to-action.

**Key elements:**
- `.home-hero-icon` — 56×56px gradient icon container with timeseries SVG
- `.home-title` — "EdaTime" heading
- `.home-tagline` — Single-line description
- `data-home-nav="upload"` — Clickable button that navigates to Upload page

---

### 2. Sample Datasets Section

```html
<div class="home-datasets">
  <h2 class="home-section-title">Try with sample data</h2>
  <p class="home-section-copy">Load built-in datasets to explore the workflow...</p>
  <div class="home-datasets-grid">
    <button class="home-dataset-card" type="button" data-sample-dataset="ettm2">
      ...
    </button>
    <button class="home-dataset-card" type="button" data-sample-dataset="sinusoidal">
      ...
    </button>
    <button class="home-dataset-card" type="button" data-sample-dataset="weather">
      ...
    </button>
  </div>
</div>
```

**Purpose:** Three clickable dataset cards that load built-in sample data.

**Dataset cards contain:**
- `.home-dataset-icon` — Icon with timeseries/grid SVG
- `.home-dataset-name` — Dataset title
- `.home-dataset-meta` — Subtitle/metadata
- `.home-dataset-desc` — Description paragraph
- `.home-dataset-tags` — Tags: type, row count, column count

**Data attributes:**
- `data-sample-dataset="ettm2"` — Loads ETTm2.csv from `/api/sample/ETTm2.csv`
- `data-sample-dataset="sinusoidal"` — Generates sinusoidal CSV client-side
- `data-sample-dataset="weather"` — Generates weather CSV client-side

---

### 3. Recommended Workflow Section

```html
<div class="home-section">
  <h2 class="home-section-title">Recommended workflow</h2>
  <p class="home-section-copy">Start with the core path...</p>
</div>
<div class="home-grid home-grid--workflow">
  <div class="home-card" data-home-nav="upload" tabindex="0" role="button">
    ...
  </div>
  <div class="home-card" data-home-nav="timeseries" tabindex="0" role="button">
    ...
  </div>
  <div class="home-card" data-home-nav="heatmap" tabindex="0" role="button">
    ...
  </div>
  <div class="home-card" data-home-nav="scatter" tabindex="0" role="button">
    ...
  </div>
</div>
```

**Purpose:** Four cards representing the core workflow pages.

**Card structure:**
```html
<div class="home-card" data-home-nav="PAGE_NAME" tabindex="0" role="button">
  <div class="home-card-icon">
    <svg>...</svg>
  </div>
  <h3 class="home-card-title">Page Name <kbd>⌥N</kbd></h3>
  <p class="home-card-desc">Description text...</p>
</div>
```

---

### 4. Advanced Analyses Section

```html
<div class="home-section">
  <h2 class="home-section-title">Advanced analyses</h2>
  <p class="home-section-copy">Use these pages after the workflow above...</p>
</div>
<div class="home-grid">
  <div class="home-card" data-home-nav="fft" tabindex="0" role="button">...</div>
  <div class="home-card" data-home-nav="spectrogram" tabindex="0" role="button">...</div>
  <div class="home-card" data-home-nav="causal" tabindex="0" role="button">...</div>
  <div class="home-card" data-home-nav="drift" tabindex="0" role="button">...</div>
</div>
```

**Purpose:** Four cards for advanced analysis pages.

---

### 5. Keyboard Shortcuts Section

```html
<div class="home-shortcuts">
  <h2 class="home-section-title">Keyboard shortcuts</h2>
  <div class="home-shortcuts-grid">
    <div class="home-shortcut-group">
      <h4 class="home-shortcut-group-title">Navigation</h4>
      <div class="home-shortcut-row"><kbd>⌥1–3, 6–0</kbd><span>Switch major pages</span></div>
      ...
    </div>
    ...
  </div>
</div>
```

**Purpose:** Reference grid showing all keyboard shortcuts grouped by category.

---

## CSS Styles

File: `frontend/css/modules/home.css`

### Page Layout
```css
.page-home {
    overflow-y: auto;
    padding: 0;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 168, 255, 0.28) rgba(255, 255, 255, 0.03);
    padding-top: 4px;
}
```

### Hero Section
```css
.home-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 24px 32px;
    background: linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%);
    border-bottom: 1px solid var(--border);
}

.home-hero-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #6c63ff));
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    box-shadow: 0 0 30px rgba(0, 168, 255, 0.25);
}
```

### Cards
```css
.home-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 20px 18px;
    cursor: pointer;
    transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
}

.home-card:hover {
    border-color: var(--accent);
    box-shadow: 0 0 16px rgba(0, 168, 255, 0.12);
    transform: translateY(-2px);
}

.home-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
```

### Sample Dataset Cards
```css
.home-dataset-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.home-dataset-tag {
    font-size: 0.5625rem;
    padding: 2px 6px;
    background: rgba(0, 168, 255, 0.1);
    border: 1px solid rgba(0, 168, 255, 0.2);
    border-radius: 4px;
    color: var(--accent);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.home-dataset-tag--size {
    background: rgba(100, 255, 150, 0.1);
    border-color: rgba(100, 255, 150, 0.2);
    color: var(--green);
}

.home-dataset-tag--rows {
    background: rgba(255, 180, 100, 0.1);
    border-color: rgba(255, 180, 100, 0.2);
    color: #ffb464;
}
```

---

## JavaScript Behavior

### Event Wiring (`appShell.ts`)

Two functions wire up all homepage interactivity:

#### `wireHomeNavigationCards(showPage)`

```typescript
function wireHomeNavigationCards(showPage: (pageName: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
        element.addEventListener('click', () => {
            const target = element.dataset.homeNav;
            if (target) showPage(target);
        });
    });
}
```

**Behavior:** Any element with `data-home-nav="PAGE_NAME"` navigates to that page when clicked.

#### `wireSampleDatasetCards(showPage)`

```typescript
function wireSampleDatasetCards(showPage: (pageName: string) => void): void {
    document.querySelectorAll<HTMLElement>('[data-sample-dataset]').forEach((element) => {
        element.addEventListener('click', () => {
            const dataset = element.dataset.sampleDataset;
            if (dataset) {
                loadSampleDataset(dataset, showPage);
            }
        });
    });
}
```

**Behavior:** Any element with `data-sample-dataset="DATASET_ID"` triggers `loadSampleDataset()`.

---

### `loadSampleDataset(datasetId, showPage)`

```typescript
async function loadSampleDataset(datasetId: string, showPage: (pageName: string) => void): Promise<void>
```

**ETTm2 workflow:**
1. Show loading toast: "Loading ETTm2 sample dataset..."
2. Fetch `/api/sample/ETTm2.csv` from backend
3. Create a `File` object from the blob
4. Hide the home page
5. Call `showPage('upload')` to navigate to Upload
6. Wait 50ms for upload panel to become visible
7. Find `#file-upload` input element
8. Use `DataTransfer` to programmatically set the file
9. Dispatch a `change` event to trigger the upload flow
10. Dismiss loading toast

**Sinusoidal workflow:**
1. Same as ETTm2, but generates CSV client-side via `generateSinusoidalCsv()`

**Weather workflow:**
1. Same as ETTm2, but generates CSV client-side via `generateWeatherCsv()`

---

### Client-Side CSV Generation

#### `generateSinusoidalCsv()`

Generates a CSV with columns: `timestamp,temperature,humidity,pressure`

- 10K rows over 7 days at 15-minute intervals
- Sine waves with added noise for temperature, humidity, pressure

#### `generateWeatherCsv()`

Generates a CSV with columns: `timestamp,temperature,humidity,pressure,wind_speed`

- 50K rows over 7 days at 10-minute intervals
- Temperature follows daily cycles + day/night variation
- Humidity, pressure, wind_speed have their own sine patterns + noise

---

## Navigation Flow

```
[Home page] ──click──> [Upload page]
    │
    ├── click "Upload a file to get started" (hero button)
    │
    ├── click any workflow card (upload, timeseries, heatmap, scatter)
    │
    ├── click any advanced card (fft, spectrogram, causal, drift)
    │
    └── click sample dataset card
            │
            ├── "ETTm2 Sensor Data" ──> fetch /api/sample/ETTm2.csv
            ├── "Sinusoidal Waves" ──> generate client-side CSV
            └── "Weather Patterns" ──> generate client-side CSV
                    │
                    └── All trigger: hide home → show upload → inject file
```

---

## Sample Dataset Backend Requirement

The ETTm2 sample dataset requires a backend endpoint:

```
GET /api/sample/ETTm2.csv
```

This endpoint should serve the static file `ETTm2.csv` from the server's static assets or data directory.

**If the endpoint is unavailable:** The app shows error toast "Could not load ETTm2: Failed to fetch ETTm2.csv: {status}"

---

## Page Visibility & Styling

### CSS Module Loading

The home page style module is registered in `pageStyles.ts`:

```typescript
export const PAGE_STYLE_MODULES: Record<string, string> = {
    home: 'css/modules/home.css?v=1',
    // ...
};

export function pageStyleModulesFor(pageName: string): string[] {
    if (pageName === 'home') return ['home'];
    // ...
}
```

### Responsive Behavior

The CSS includes a mobile breakpoint at 640px:

```css
@media (max-width: 640px) {
    .home-grid {
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
        padding: 12px;
    }

    .home-title {
        font-size: 1.375rem;
    }
}
```

---

## Accessibility

| Element | Accessibility Feature |
|---------|---------------------|
| Hero button | `type="button"`, implicit role |
| Navigation cards | `tabindex="0"`, `role="button"` |
| Sample dataset cards | `type="button"`, `aria-label="Load {name} sample dataset"` |
| Keyboard shortcut `<kbd>` | Styled with gradient background, border-bottom for 3D effect |
| Shortcut rows | Semantic `<kbd>` element for screen reader recognition |

---

## Complete HTML Copy

To recreate the homepage, copy this complete HTML structure:

```html
<section class="page page-home" id="page-home" data-page-name="home" hidden>
  <!-- Hero -->
  <div class="home-hero">
    <div class="home-hero-icon">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="2,18 7,10 12,22 17,6 22,16 27,12 30,12" />
      </svg>
    </div>
    <h1 class="home-title">EdaTime</h1>
    <p class="home-tagline">Interactive time-series analytics — upload a CSV or Parquet, explore, and export.</p>
    <button class="btn btn-primary" type="button" data-home-nav="upload">
      Upload a file to get started
    </button>
  </div>

  <!-- Sample Datasets -->
  <div class="home-datasets">
    <h2 class="home-section-title">Try with sample data</h2>
    <p class="home-section-copy">Load built-in datasets to explore the workflow without preparing a file.</p>
    <div class="home-datasets-grid">
      <!-- ETTm2 Card -->
      <button class="home-dataset-card" type="button" data-sample-dataset="ettm2" aria-label="Load ETTm2 sample dataset">
        <div class="home-dataset-header">
          <div class="home-dataset-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />
            </svg>
          </div>
          <div class="home-dataset-info">
            <div class="home-dataset-name">ETTm2 Sensor Data</div>
            <div class="home-dataset-meta">Electrical transformer monitoring</div>
          </div>
        </div>
        <p class="home-dataset-desc">Time series with multiple sensor readings including temperature, pressure, and power metrics.</p>
        <div class="home-dataset-tags">
          <span class="home-dataset-tag">Time-series</span>
          <span class="home-dataset-tag home-dataset-tag--rows">69K rows</span>
          <span class="home-dataset-tag home-dataset-tag--size">7 columns</span>
        </div>
      </button>

      <!-- Sinusoidal Card -->
      <button class="home-dataset-card" type="button" data-sample-dataset="sinusoidal" aria-label="Load Sinusoidal Waves sample dataset">
        <div class="home-dataset-header">
          <div class="home-dataset-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1,8 4,4 7,12 10,2 13,10 15,6" />
            </svg>
          </div>
          <div class="home-dataset-info">
            <div class="home-dataset-name">Sinusoidal Waves</div>
            <div class="home-dataset-meta">Generated periodic signals</div>
          </div>
        </div>
        <p class="home-dataset-desc">Multiple sine waves with different frequencies for testing FFT and spectral analysis features.</p>
        <div class="home-dataset-tags">
          <span class="home-dataset-tag">FFT</span>
          <span class="home-dataset-tag home-dataset-tag--rows">10K rows</span>
          <span class="home-dataset-tag home-dataset-tag--size">4 columns</span>
        </div>
      </button>

      <!-- Weather Card -->
      <button class="home-dataset-card" type="button" data-sample-dataset="weather" aria-label="Load Weather Patterns sample dataset">
        <div class="home-dataset-header">
          <div class="home-dataset-icon">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="1" width="4" height="4" rx="0.5" /><rect x="6" y="1" width="4" height="4" rx="0.5" /><rect x="11" y="1" width="4" height="4" rx="0.5" /><rect x="1" y="6" width="4" height="4" rx="0.5" /><rect x="6" y="6" width="4" height="4" rx="0.5" /><rect x="11" y="6" width="4" height="4" rx="0.5" />
            </svg>
          </div>
          <div class="home-dataset-info">
            <div class="home-dataset-name">Weather Patterns</div>
            <div class="home-dataset-meta">Temperature and humidity readings</div>
          </div>
        </div>
        <p class="home-dataset-desc">Environmental sensor data with correlated temperature, humidity, and pressure readings.</p>
        <div class="home-dataset-tags">
          <span class="home-dataset-tag">Correlations</span>
          <span class="home-dataset-tag home-dataset-tag--rows">50K rows</span>
          <span class="home-dataset-tag home-dataset-tag--size">6 columns</span>
        </div>
      </button>
    </div>
  </div>

  <!-- Workflow Cards -->
  <div class="home-section">
    <h2 class="home-section-title">Recommended workflow</h2>
    <p class="home-section-copy">Start with the core path, then branch into advanced analyses only after you know which columns and intervals matter.</p>
  </div>
  <div class="home-grid home-grid--workflow">
    <!-- Upload card -->
    <div class="home-card" data-home-nav="upload" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" /><polyline points="11 5 8 2 5 5" /><line x1="8" y1="2" x2="8" y2="11" />
        </svg>
      </div>
      <h3 class="home-card-title">Upload <kbd>⌥1</kbd></h3>
      <p class="home-card-desc">Drag &amp; drop CSV or Parquet files. Preview column profiles before ingesting. Select a column subset and time slice for partial loads.</p>
    </div>

    <!-- Timeseries card -->
    <div class="home-card" data-home-nav="timeseries" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1,10 4,6 7,12 10,3 13,8 15,7" />
        </svg>
      </div>
      <h3 class="home-card-title">Timeseries <kbd>⌥2</kbd></h3>
      <p class="home-card-desc">WebGPU-accelerated multi-series chart with zoom, custom colors, rolling bands, anomaly detection, and adaptive line filters.</p>
    </div>

    <!-- Correlations card -->
    <div class="home-card" data-home-nav="heatmap" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="1" width="4" height="4" rx="0.5" /><rect x="6" y="1" width="4" height="4" rx="0.5" /><rect x="11" y="1" width="4" height="4" rx="0.5" /><rect x="1" y="6" width="4" height="4" rx="0.5" /><rect x="6" y="6" width="4" height="4" rx="0.5" /><rect x="11" y="6" width="4" height="4" rx="0.5" /><rect x="1" y="11" width="4" height="4" rx="0.5" /><rect x="6" y="11" width="4" height="4" rx="0.5" /><rect x="11" y="11" width="4" height="4" rx="0.5" />
        </svg>
      </div>
      <h3 class="home-card-title">Correlations <kbd>⌥7</kbd></h3>
      <p class="home-card-desc">Screen pairs in the correlation heatmap, then jump into the detailed scatter view for the promising relationships.</p>
    </div>

    <!-- Scatter card -->
    <div class="home-card" data-home-nav="scatter" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="4" cy="11" r="1.2" /><circle cx="8" cy="6" r="1.2" /><circle cx="12" cy="9" r="1.2" /><circle cx="6" cy="13" r="1.2" /><circle cx="11" cy="3" r="1.2" />
        </svg>
      </div>
      <h3 class="home-card-title">Scatter / Density <kbd>⌥3</kbd></h3>
      <p class="home-card-desc">Inspect the selected pair in detail, color by an extra column, and switch to matrix view with <kbd>⌥4</kbd> for pairwise screening inside the same workspace.</p>
    </div>
  </div>

  <!-- Advanced Analyses Section -->
  <div class="home-section">
    <h2 class="home-section-title">Advanced analyses</h2>
    <p class="home-section-copy">Use these pages after the workflow above has narrowed the signal, time window, or candidate variables.</p>
  </div>
  <div class="home-grid">
    <!-- FFT -->
    <div class="home-card" data-home-nav="fft" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1,8 3,4 5,10 7,2 9,12 11,6 13,8 15,8" />
        </svg>
      </div>
      <h3 class="home-card-title">FFT / PSD <kbd>⌥6</kbd></h3>
      <p class="home-card-desc">Frequency-domain analysis with magnitude or power spectral density. Log scale, multi-trace overlay, zoom, and PNG/SVG/CSV export.</p>
    </div>

    <!-- Spectrogram -->
    <div class="home-card" data-home-nav="spectrogram" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="2" width="2" height="12" rx="0.3" /><rect x="4" y="4" width="2" height="8" rx="0.3" /><rect x="7" y="1" width="2" height="14" rx="0.3" /><rect x="10" y="5" width="2" height="6" rx="0.3" /><rect x="13" y="3" width="2" height="10" rx="0.3" />
        </svg>
      </div>
      <h3 class="home-card-title">Spectrogram <kbd>⌥8</kbd></h3>
      <p class="home-card-desc">Time-frequency heatmap using short-time FFT. Adjustable window size, log scale, zoom, and PNG export.</p>
    </div>

    <!-- Causal -->
    <div class="home-card" data-home-nav="causal" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="3" cy="8" r="2" /><circle cx="13" cy="4" r="2" /><circle cx="13" cy="12" r="2" /><line x1="5" y1="7.2" x2="11" y2="4.8" /><line x1="5" y1="8.8" x2="11" y2="11.2" />
        </svg>
      </div>
      <h3 class="home-card-title">Causal Discovery <kbd>⌥9</kbd></h3>
      <p class="home-card-desc">PCMCI, PCMCI+, FullCI, BivCI, and LPCMCI via Tigramite. Directed graph with edge lag and p-value labels. Export to JSON or torch_geometric.</p>
    </div>

    <!-- Drift -->
    <div class="home-card" data-home-nav="drift" tabindex="0" role="button">
      <div class="home-card-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1" y="7" width="3" height="7" rx="0.5" /><rect x="5" y="4" width="3" height="10" rx="0.5" /><rect x="9" y="6" width="3" height="8" rx="0.5" /><rect x="13" y="2" width="2" height="12" rx="0.5" /><polyline points="1,5 5,2 9,4 13,1" stroke-dasharray="2 1.5" />
        </svg>
      </div>
      <h3 class="home-card-title">Drift Analysis <kbd>⌥0</kbd></h3>
      <p class="home-card-desc">Compare windows and detect distribution or score shifts once the main workflow has identified the slices worth monitoring.</p>
    </div>
  </div>

  <!-- Keyboard Shortcuts -->
  <div class="home-shortcuts">
    <h2 class="home-section-title">Keyboard shortcuts</h2>
    <div class="home-shortcuts-grid">
      <div class="home-shortcut-group">
        <h4 class="home-shortcut-group-title">Navigation</h4>
        <div class="home-shortcut-row"><kbd>⌥1–3, 6–0</kbd><span>Switch major pages</span></div>
        <div class="home-shortcut-row"><kbd>⌥4</kbd><span>Open scatter matrix view</span></div>
        <div class="home-shortcut-row"><kbd>Ctrl+K</kbd><span>Command palette</span></div>
        <div class="home-shortcut-row"><kbd>Ctrl+I</kbd><span>Analysis context panel</span></div>
      </div>
      <div class="home-shortcut-group">
        <h4 class="home-shortcut-group-title">Chart</h4>
        <div class="home-shortcut-row"><kbd>Double-click</kbd><span>Reset zoom</span></div>
        <div class="home-shortcut-row"><kbd>Ctrl+click</kbd><span>Set adaptive filter target</span></div>
        <div class="home-shortcut-row"><kbd>Drag</kbd><span>Pan / draw</span></div>
      </div>
      <div class="home-shortcut-group">
        <h4 class="home-shortcut-group-title">Session</h4>
        <div class="home-shortcut-row"><kbd>Ctrl+S</kbd><span>Save session</span></div>
        <div class="home-shortcut-row"><kbd>Ctrl+Shift+S</kbd><span>Export session file</span></div>
        <div class="home-shortcut-row"><kbd>Ctrl+O</kbd><span>Import session file</span></div>
      </div>
      <div class="home-shortcut-group">
        <h4 class="home-shortcut-group-title">Drift</h4>
        <div class="home-shortcut-row"><kbd>Enter / D</kbd><span>Run drift compute</span></div>
        <div class="home-shortcut-row"><kbd>E</kbd><span>Export drift CSV</span></div>
        <div class="home-shortcut-row"><kbd>J / P</kbd><span>Export JSON / PNG</span></div>
      </div>
    </div>
  </div>
</section>
```

---

## Dependencies & Integration Points

| Dependency | Purpose |
|------------|---------|
| `appShell.ts` | Wires up navigation cards and sample dataset handlers |
| `pageStyles.ts` | Loads `css/modules/home.css` when page is visited |
| `router.ts` | Default route is `home` when no hash is present |
| `guidedWorkflow.ts` | Tracks home as a possible workflow step |
| `toast.ts` | Shows loading/feedback toasts during sample dataset load |
| `/api/sample/ETTm2.csv` | Backend endpoint for ETTm2 sample data |

---

## Summary

The homepage is a pure marketing/orientation page with:
1. A hero CTA button that navigates to Upload
2. Three sample dataset cards that load pre-built data
3. Two grids of workflow cards (core + advanced) that navigate to respective pages
4. A keyboard shortcuts reference grid

It has no analysis state of its own — all interactivity is navigation or dataset loading. The CSS handles hover/focus effects, responsive layout, and theming via CSS variables. The JavaScript is minimal (only two event wiring functions and one async loader function).