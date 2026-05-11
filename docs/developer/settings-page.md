# Settings Modal

**Page ID:** `settings` (but implemented as a modal dialog, not a page section)
**Route:** `#page=settings`
**Entry:** Sidebar nav button or `Ctrl+,`
**CSS Module:** `frontend/css/modules/settings.css`

---

## Purpose

Global application settings modal. Covers appearance (theme, layout, chart palette), export defaults, analytics defaults, causal defaults, spectral/FFT defaults, and timeseries chart behavior.

> **Note:** The Settings "page" is not a separate `<section class="page">` — it is a modal overlay (`#settings-modal`) that is opened from any context. The route `#page=settings` maps to the settings modal in the router, but the UI is a modal dialog rather than a full page.

---

## HTML Structure

```html
<div id="settings-modal" class="modal-backdrop settings-modal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="modal-header">
      <div class="modal-title" id="settings-title">Settings</div>
      <button class="btn btn-ghost" id="settings-close-btn" type="button">Close</button>
    </div>

    <!-- Tab bar -->
    <div class="settings-tabs">
      <button class="settings-tab-btn active" data-tab="appearance" type="button">Appearance</button>
      <button class="settings-tab-btn" data-tab="export" type="button">Export</button>
      <button class="settings-tab-btn" data-tab="analytics" type="button">Analytics</button>
      <button class="settings-tab-btn" data-tab="causal" type="button">Causal</button>
      <button class="settings-tab-btn" data-tab="spectral" type="button">Spectral</button>
      <button class="settings-tab-btn" data-tab="timeseries" type="button">Timeseries</button>
    </div>

    <!-- Appearance Tab -->
    <div class="settings-tab-panel" data-tab="appearance">
      <div class="settings-section">
        <div class="settings-section-title">Theme</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-theme">Color scheme</label>
          <div class="settings-control">
            <select id="settings-theme" class="modal-select">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto (system)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Layout</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-layout">Density</label>
          <div class="settings-control">
            <select id="settings-layout" class="modal-select">
              <option value="spacious">Spacious</option>
              <option value="compact">Compact</option>
            </select>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Colors</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-palette">Chart palette</label>
          <div class="settings-control">
            <select id="settings-palette" class="modal-select">
              <option value="default">Default</option>
              <option value="ocean">Ocean</option>
              <option value="sunset">Sunset</option>
              <option value="forest">Forest</option>
              <option value="monochrome">Monochrome</option>
              <option value="neon">Neon</option>
            </select>
            <div id="settings-palette-preview" class="palette-preview"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Tab -->
    <div class="settings-tab-panel" data-tab="export" hidden>
      <div class="settings-section">
        <div class="settings-section-title">Export Defaults</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-export-format">Default format</label>
          <div class="settings-control">
            <select id="settings-export-format" class="modal-select">
              <option value="png">PNG</option><option value="svg">SVG</option>
              <option value="csv">CSV</option><option value="json">JSON</option>
              <option value="parquet">Parquet</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-white-bg">Presentation mode</label>
          <div class="settings-control settings-toggle">
            <input id="settings-white-bg" type="checkbox" aria-label="Use white background for exports">
            <span>White background for exports</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Tab -->
    <div class="settings-tab-panel" data-tab="analytics" hidden>
      <div class="settings-section">
        <div class="settings-section-title">Correlation</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-correlation">Default metric</label>
          <div class="settings-control">
            <select id="settings-correlation" class="modal-select">
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </select>
            <div class="settings-hint">Used for scatter suggestions and heatmap</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Causal Tab -->
    <div class="settings-tab-panel" data-tab="causal" hidden>
      <div class="settings-section">
        <div class="settings-section-title">Causal Discovery</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-causal-method">Default method</label>
          <div class="settings-control">
            <select id="settings-causal-method" class="modal-select">
              <option value="pcmci">PCMCI</option>
              <option value="pcmciplus">PCMCI+</option>
              <option value="lpcmci">LPCMCI</option>
              <option value="fullci">Full CI</option>
              <option value="bivci">Bivariate CI</option>
            </select>
          </div>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-tau-max">Default tau max</label>
          <div class="settings-control">
            <input id="settings-tau-max" type="number" class="modal-input" min="1" max="10" value="5" style="width:80px;">
            <div class="settings-hint">Maximum time lag to consider</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Spectral Tab -->
    <div class="settings-tab-panel" data-tab="spectral" hidden>
      <div class="settings-section">
        <div class="settings-section-title">FFT Presets</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-fft-preset">Default preset</label>
          <div class="settings-control">
            <select id="settings-fft-preset" class="modal-select">
              <option value="auto">Auto (detect from data)</option>
              <option value="slow-trends">Slow trends (large window)</option>
              <option value="fast-oscillations">Fast oscillations (small window)</option>
              <option value="balanced">Balanced</option>
            </select>
            <div class="settings-hint">Preset for spectrogram window size</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeseries Tab -->
    <div class="settings-tab-panel" data-tab="timeseries" hidden>
      <div class="settings-section">
        <div class="settings-section-title">Chart Behavior</div>
        <div class="settings-row">
          <label class="settings-label" for="settings-draw-auto-reset">Draw auto-reset</label>
          <div class="settings-control settings-toggle">
            <input id="settings-draw-auto-reset" type="checkbox" aria-label="Auto-reset draw tool after annotation">
            <span>Auto-reset draw tool after placing an annotation</span>
          </div>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-color-scale">Color scale</label>
          <div class="settings-control">
            <select id="settings-color-scale" class="modal-select">
              <option value="viridis">Viridis</option>
              <option value="plasma">Plasma</option>
              <option value="magma">Magma</option>
              <option value="coolwarm">Cool-Warm</option>
              <option value="inferno">Inferno</option>
            </select>
            <div class="settings-hint">Used for gradient color-by on timeseries chart</div>
          </div>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-sidebar-collapsed">Sidebar default</label>
          <div class="settings-control settings-toggle">
            <input id="settings-sidebar-collapsed" type="checkbox" aria-label="Start with sidebar collapsed">
            <span>Start with sidebar collapsed</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer actions -->
    <div class="modal-actions">
      <button class="btn btn-ghost" id="settings-reset-btn" type="button">Reset to Defaults</button>
      <div class="modal-actions-right">
        <button class="btn btn-ghost" id="settings-cancel-btn" type="button">Cancel</button>
        <button class="btn btn-primary" id="settings-apply-btn" type="button">Apply</button>
      </div>
    </div>
  </div>
</div>
```

---

## CSS Classes

From `frontend/css/modules/settings.css`:

| Class | Element |
|---|---|
| `.settings-modal` | Modal backdrop container |
| `.settings-tabs` | Tab button row |
| `.settings-tab-btn` | Individual tab button |
| `.settings-tab-btn.active` | Active tab state |
| `.settings-tab-panel` | Tab content panel (hidden/shown by data-tab) |
| `.settings-section` | Grouped settings section |
| `.settings-section-title` | Section header title |
| `.settings-row` | Label + control row |
| `.settings-label` | Label text for a setting |
| `.settings-control` | Container for the control input/select |
| `.settings-toggle` | Checkbox toggle wrapper |
| `.settings-hint` | Hint text below a control |
| `.palette-preview` | Color palette preview swatches |
| `.modal-actions` | Footer action row (Reset / Cancel / Apply) |
| `.modal-actions-right` | Right-aligned action group |

---

## JavaScript Modules

### `frontend/src/ui/settings.ts` (assumed)

`initSettings()` — wires:
- Tab switching: clicking a tab button hides all panels, shows the selected one, updates `active` class
- Each control → updates corresponding `appState` setting on change
- "Reset to Defaults" → restores all settings to initial values
- "Cancel" → closes modal without saving
- "Apply" → persists settings (calls backend to save if needed) and closes modal
- `Ctrl+,` keyboard shortcut → opens modal from anywhere

### State Keys (appState)

Settings are stored in `appState.settings` (or similar):

| Setting | Control ID | Type |
|---|---|---|
| `theme` | `settings-theme` | `dark`\|`light`\|`auto` |
| `layout` | `settings-layout` | `spacious`\|`compact` |
| `palette` | `settings-palette` | `default`\|`ocean`\|`sunset`\|`forest`\|`monochrome`\|`neon` |
| `exportFormat` | `settings-export-format` | `png`\|`svg`\|`csv`\|`json`\|`parquet` |
| `whiteBgExport` | `settings-white-bg` | boolean |
| `defaultCorrelation` | `settings-correlation` | `pearson`\|`spearman` |
| `defaultCausalMethod` | `settings-causal-method` | `pcmci`\|`pcmciplus`\|`lpcmci`\|`fullci`\|`bivci` |
| `defaultTauMax` | `settings-tau-max` | number |
| `fftPreset` | `settings-fft-preset` | `auto`\|`slow-trends`\|`fast-oscillations`\|`balanced` |
| `drawAutoReset` | `settings-draw-auto-reset` | boolean |
| `colorScale` | `settings-color-scale` | `viridis`\|`plasma`\|`magma`\|`coolwarm`\|`inferno` |
| `sidebarCollapsed` | `settings-sidebar-collapsed` | boolean |

---

## Screenshots

- `docs/screenshots/settings.png` — settings modal (tab bar visible, no tab content visible in screenshot)

---

## Notes

- Settings modal is accessible from any page via the sidebar settings button or `Ctrl+,`.
- The "Apply" button is the primary action; "Cancel" dismisses without saving.
- "Reset to Defaults" restores all settings to their initial values.
- Some settings take effect immediately (theme, palette), while others apply on the next relevant action (causal method, FFT preset).