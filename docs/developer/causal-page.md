# Causal Discovery Page

**Page ID:** `causal`
**Route:** `#page=causal`
**Entry:** Sidebar nav (⌥9) or home card navigation, or "Open in Causal" from Scatter
**CSS Module:** `frontend/css/modules/chart.css` (shared)

---

## Purpose

Causal graph discovery using Tigramite-style algorithms (PCMCI, PCMCI+, FullCI, BivCI, LPCMCI). Build a directed graph of causal relationships between time-series variables with configurable independence tests, lags, and significance thresholds. Compare multiple saved runs side-by-side.

---

## HTML Structure

### Toolbar (lines 749–822)

```html
<section class="page" id="page-causal" data-page-name="causal" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label"
        title="Causal discovery using tigramite algorithms. Select columns, configure parameters, and press Compute.">Causal Discovery (Tigramite)</span>
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Tigramite references used by this page.&#10;• Package: Tigramite, causal inference for time series datasets.&#10;• Overview: Runge, Gerhardus, Varando et al. Causal inference for time series. Nat Rev Earth Environ (2023).&#10;• PCMCI: Runge et al. Detecting and quantifying causal associations in large nonlinear time series datasets. Sci Adv (2019).&#10;• PCMCI+: Runge. Discovering contemporaneous and lagged causal relations in autocorrelated nonlinear time series datasets. UAI (2020).&#10;• LPCMCI: Gerhardus and Runge. High-recall causal discovery for autocorrelated time series with latent confounders. NeurIPS (2020).">ⓘ</span>
      <label class="scatter-inline-label" for="causal-method-select">Method</label>
      <select id="causal-method-select" class="modal-select" aria-label="PCMCI method">
        <option value="pcmci" selected>PCMCI</option>
        <option value="pcmciplus">PCMCI+</option>
        <option value="fullci">FullCI</option>
        <option value="bivci">BivCI</option>
        <option value="lpcmci">LPCMCI</option>
      </select>
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Causal discovery algorithm.&#10;• PCMCI: Two-step PC parent selection plus MCI testing. Reference: Runge et al., Sci Adv (2019).&#10;• PCMCI+: Adds contemporaneous link orientation. Reference: Runge, UAI (2020).&#10;• FullCI: Conditions on all lagged variables directly; no PC pre-selection.&#10;• BivCI: Bivariate screening against the target's own past; fastest but weakest adjustment.&#10;• LPCMCI: Extends PCMCI to latent confounding. Reference: Gerhardus and Runge, NeurIPS (2020).&#10;Controls disabled in the toolbar are ignored by the selected method.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-test-select">Test</label>
      <select id="causal-test-select" class="modal-select" aria-label="Independence test">
        <option value="par_corr" selected>ParCorr</option>
        <option value="robust_parcorr">RobustParCorr</option>
        <option value="cmi_knn">CMI-KNN</option>
        <option value="gsquared">G-squared</option>
        <option value="cmi_symb">CMI-Symb</option>
      </select>
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Conditional independence test used inside the Tigramite-style causal engine.&#10;• ParCorr: Linear partial correlation; best when relations are near-Gaussian and linear.&#10;• RobustParCorr: Rank/non-paranormal style preprocessing plus ParCorr.&#10;• CMI-KNN: Nonlinear conditional mutual information. Reference: Runge, AISTATS (2018).&#10;• G-squared: Discrete/categorical likelihood-ratio test.&#10;• CMI-Symb: Symbolic/discretized mutual information test.&#10;Backend causal discovery is still numeric-data oriented even if non-numeric columns are shown as manual graph nodes.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-tau-max">τ max</label>
      <input id="causal-tau-max" type="number" min="1" max="10" value="3" class="modal-input" style="width:50px;"
        aria-label="Maximum time lag (tau max)">
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Maximum time lag τ to test (1–10). Higher means more lagged relationships are evaluated, but runtime grows quickly.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-alpha">α</label>
      <input id="causal-alpha" type="number" min="0.001" max="0.5" step="0.01" value="0.05" class="modal-input"
        style="width:60px;" aria-label="Significance level (alpha)">
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Final significance threshold α. Links with p-values above α are removed from the final result.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-pc-alpha">PC α</label>
      <input id="causal-pc-alpha" type="number" min="0.001" max="0.5" step="0.01" value="0.2" class="modal-input"
        style="width:60px;" aria-label="PC stage significance level">
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Significance threshold for the PC parent-selection stage. Used by PCMCI, PCMCI+, and LPCMCI. Disabled for FullCI and BivCI because those methods do not run the PC step.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-max-conds">Max conds</label>
      <input id="causal-max-conds" type="number" min="1" max="20" value="" placeholder="auto" class="modal-input"
        style="width:60px;" aria-label="Maximum conditioning set size">
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="Maximum conditioning-set size used in the PC parent-selection stage. Used by PCMCI, PCMCI+, and LPCMCI only. &quot;auto&quot; lets the backend decide.">ⓘ</span>
      <label class="scatter-inline-label" for="causal-fdr-select">FDR</label>
      <select id="causal-fdr-select" class="modal-select" aria-label="FDR correction">
        <option value="none" selected>None</option>
        <option value="fdr_bh">Benjamini-Hochberg</option>
      </select>
      <span class="causal-info-icon" tabindex="0"
        data-causal-tip="False Discovery Rate correction.&#10;• None: Raw p-values.&#10;• Benjamini-Hochberg: Controls FDR across all tested links.">ⓘ</span>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <button id="causal-add-edge-btn" class="btn btn-ghost btn-sm" type="button"
        title="Click two nodes to add an edge between them">+ Edge</button>
      <div style="position:relative;display:inline-flex;">
        <button id="causal-export-btn" class="btn btn-ghost btn-sm" type="button" title="Export graph">Export ▾</button>
        <div id="causal-export-menu" class="causal-export-menu" hidden>
          <button class="causal-export-item" data-fmt="json" type="button">JSON (full graph)</button>
          <button class="causal-export-item" data-fmt="glm" type="button">GLM formula (.txt)</button>
          <button class="causal-export-item" data-fmt="torch" type="button">torch_geometric (.json)</button>
        </div>
      </div>
      <button id="causal-save-run-btn" class="btn btn-ghost btn-sm" type="button"
        title="Save this causal run for comparison">Save Run</button>
      <button id="causal-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <span class="toolbar-label" id="causal-status">Select columns and press Compute.</span>
    </div>
  </div>

  <!-- Page guidance -->
  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> A short candidate list after you already screened variables in Timeseries, Scatter, or Heatmap.</span>
    <span class="page-guidance__item"><strong>Needs</strong> At least two numeric columns, a defensible lag horizon, and a clear hypothesis about which links are worth testing.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Slowest page in the app. Reduce the column set first, then increase lags or nonlinear tests only when the first pass is interpretable.</span>
  </div>

  <!-- Progress bar (shown during compute) -->
  <div id="causal-progress" class="causal-progress-wrap" hidden>
    <div class="causal-progress-track">
      <div class="causal-progress-fill" id="causal-progress-fill"></div>
    </div>
    <span class="causal-progress-label" id="causal-progress-label"></span>
  </div>

  <!-- Column chips bar (same as FFT page, reused) -->
  <div class="fft-traces-bar" id="causal-columns-bar"
    style="flex-wrap:wrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-height:34px;">
  </div>

  <main class="main main--flex">
    <div id="causal-chart" style="width:100%;height:100%;"></div>
    <div id="causal-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>No causal graph yet</strong>
      <span>Select at least two numeric columns above, then click Compute to build the graph.</span>
    </div>
    <div id="causal-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Running causal discovery…</span>
    </div>
  </main>

  <!-- Right-click context menu -->
  <div id="causal-ctx-menu" class="causal-ctx-menu" hidden>
    <button class="causal-ctx-item" id="causal-ctx-edit" type="button">✎ Edit attributes</button>
    <button class="causal-ctx-item causal-ctx-danger" id="causal-ctx-delete" type="button">✕ Delete</button>
  </div>

  <!-- Edit panel (slides in from the right) -->
  <div id="causal-edit-panel" class="causal-edit-panel" hidden>
    <div class="causal-edit-header">
      <span id="causal-edit-title">Edit</span>
      <button class="causal-edit-close" id="causal-edit-close" type="button" aria-label="Close">✕</button>
    </div>
    <div id="causal-edit-body" class="causal-edit-body"></div>
    <div class="causal-edit-footer">
      <button class="btn btn-accent btn-sm" id="causal-edit-apply" type="button">Apply</button>
      <button class="btn btn-ghost btn-sm causal-ctx-danger" id="causal-edit-delete" type="button">Delete</button>
    </div>
  </div>

  <!-- Run comparison panel (bottom) -->
  <div id="causal-compare-panel" class="causal-compare-panel">
    <div class="causal-compare-panel-header">
      <span class="toolbar-label">Run Comparison</span>
      <select id="causal-compare-run-a" class="modal-select" aria-label="Run A"></select>
      <span class="causal-compare-vs">vs</span>
      <select id="causal-compare-run-b" class="modal-select" aria-label="Run B"></select>
      <button id="causal-compare-run-btn" class="btn btn-ghost btn-sm" type="button">Compare</button>
      <button id="causal-compare-clear-btn" class="btn btn-ghost btn-sm causal-compare-clear-btn" type="button"
        title="Delete all saved runs">Clear All</button>
    </div>
    <div id="causal-saved-runs-list" class="causal-saved-runs-list"></div>
    <div id="causal-compare-results" class="causal-compare-results"></div>
  </div>
</section>
```

---

## CSS Classes

| Class | Element |
|---|---|
| `.causal-info-icon` | ⓘ icon that shows a tooltip on hover/focus |
| `.causal-progress-wrap` | Container for progress bar during compute |
| `.causal-progress-track` | Track element of progress bar |
| `.causal-progress-fill` | Fill element (animated width) |
| `.causal-progress-label` | Text label showing current step |
| `.causal-ctx-menu` | Right-click context menu on graph nodes/edges |
| `.causal-ctx-item` | Context menu item |
| `.causal-ctx-danger` | Danger-styled context menu item (delete) |
| `.causal-edit-panel` | Slide-in edit panel for edge/node attributes |
| `.causal-edit-header` | Header of edit panel |
| `.causal-edit-body` | Body content of edit panel |
| `.causal-edit-footer` | Footer with Apply/Delete buttons |
| `.causal-compare-panel` | Run comparison panel at bottom |
| `.causal-compare-panel-header` | Header row with run selectors |
| `.causal-compare-vs` | "vs" label between selectors |
| `.causal-saved-runs-list` | List of saved runs |
| `.causal-compare-results` | Comparison results display |
| `.causal-export-menu` | Dropdown export format menu |
| `.causal-export-item` | Export format option |

---

## JavaScript Modules

### `frontend/src/causal/causalPage.ts` (assumed)

`initCausalPage()` — wires:
- Method select → enables/disables PC α and Max conds controls based on method
- Test select → ParCorr, RobustParCorr, CMI-KNN, G-squared, CMI-Symb
- τ max, α, PC α, Max conds, FDR controls
- "+ Edge" button → enters edge-addition mode; next two node clicks add an edge
- "Export ▾" → shows dropdown menu with JSON / GLM / torch_geometric formats
- "Save Run" → saves current graph to `appState.causalRuns[]`
- "Compute" → calls backend causal API with current settings + selected columns
- Progress bar updates via `edatime:causal-progress` events
- Right-click on node/edge → shows context menu
- Context menu "Edit attributes" → opens edit panel
- Run comparison panel → selects two saved runs and compares them

### Backend API

**Compute causal graph:**
```
POST /api/causal/compute
Body: {
  "columns": ["colA", "colB", "colC"],
  "method": "pcmci"|"pcmciplus"|"fullci"|"bivci"|"lpcmci",
  "test": "par_corr"|"robust_parcorr"|"cmi_knn"|"gsquared"|"cmi_symb",
  "tauMax": 3,
  "alpha": 0.05,
  "pcAlpha": 0.2,
  "maxConds": null,  // null = auto
  "fdr": "none"|"fdr_bh"
}
Response: {
  "nodes": [{"id": "colA", "type": "variable"}, ...],
  "edges": [{
    "source": "colA", "target": "colB",
    "lag": 1, "pvalue": 0.003, "strength": 0.72
  }, ...]
}
```

---

## Complete HTML Copy

```html
<section class="page" id="page-causal" data-page-name="causal" hidden>
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="toolbar-label" title="Causal discovery using tigramite algorithms...">Causal Discovery (Tigramite)</span>
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-method-select">Method</label>
      <select id="causal-method-select" class="modal-select" aria-label="PCMCI method">
        <option value="pcmci" selected>PCMCI</option>
        <option value="pcmciplus">PCMCI+</option>
        <option value="fullci">FullCI</option>
        <option value="bivci">BivCI</option>
        <option value="lpcmci">LPCMCI</option>
      </select>
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-test-select">Test</label>
      <select id="causal-test-select" class="modal-select" aria-label="Independence test">
        <option value="par_corr" selected>ParCorr</option>
        <option value="robust_parcorr">RobustParCorr</option>
        <option value="cmi_knn">CMI-KNN</option>
        <option value="gsquared">G-squared</option>
        <option value="cmi_symb">CMI-Symb</option>
      </select>
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-tau-max">τ max</label>
      <input id="causal-tau-max" type="number" min="1" max="10" value="3" class="modal-input" style="width:50px;" aria-label="Maximum time lag">
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-alpha">α</label>
      <input id="causal-alpha" type="number" min="0.001" max="0.5" step="0.01" value="0.05" class="modal-input" style="width:60px;" aria-label="Significance level">
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-pc-alpha">PC α</label>
      <input id="causal-pc-alpha" type="number" min="0.001" max="0.5" step="0.01" value="0.2" class="modal-input" style="width:60px;" aria-label="PC stage significance level">
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-max-conds">Max conds</label>
      <input id="causal-max-conds" type="number" min="1" max="20" value="" placeholder="auto" class="modal-input" style="width:60px;" aria-label="Maximum conditioning set size">
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
      <label class="scatter-inline-label" for="causal-fdr-select">FDR</label>
      <select id="causal-fdr-select" class="modal-select" aria-label="FDR correction">
        <option value="none" selected>None</option>
        <option value="fdr_bh">Benjamini-Hochberg</option>
      </select>
      <span class="causal-info-icon" tabindex="0" data-causal-tip="...">ⓘ</span>
    </div>
    <div class="toolbar-group toolbar-group--push">
      <button id="causal-add-edge-btn" class="btn btn-ghost btn-sm" type="button" title="Click two nodes to add an edge between them">+ Edge</button>
      <div style="position:relative;display:inline-flex;">
        <button id="causal-export-btn" class="btn btn-ghost btn-sm" type="button" title="Export graph">Export ▾</button>
        <div id="causal-export-menu" class="causal-export-menu" hidden>
          <button class="causal-export-item" data-fmt="json" type="button">JSON (full graph)</button>
          <button class="causal-export-item" data-fmt="glm" type="button">GLM formula (.txt)</button>
          <button class="causal-export-item" data-fmt="torch" type="button">torch_geometric (.json)</button>
        </div>
      </div>
      <button id="causal-save-run-btn" class="btn btn-ghost btn-sm" type="button" title="Save this causal run for comparison">Save Run</button>
      <button id="causal-compute-btn" class="btn btn-accent btn-sm" type="button">Compute</button>
      <span class="toolbar-label" id="causal-status">Select columns and press Compute.</span>
    </div>
  </div>

  <div class="page-guidance page-guidance--advanced">
    <span class="page-guidance__item"><strong>Best for</strong> A short candidate list after you already screened variables in Timeseries, Scatter, or Heatmap.</span>
    <span class="page-guidance__item"><strong>Needs</strong> At least two numeric columns, a defensible lag horizon, and a clear hypothesis about which links are worth testing.</span>
    <span class="page-guidance__item"><strong>Cost</strong> Slowest page in the app. Reduce the column set first, then increase lags or nonlinear tests only when the first pass is interpretable.</span>
  </div>

  <div id="causal-progress" class="causal-progress-wrap" hidden>
    <div class="causal-progress-track">
      <div class="causal-progress-fill" id="causal-progress-fill"></div>
    </div>
    <span class="causal-progress-label" id="causal-progress-label"></span>
  </div>

  <div class="fft-traces-bar" id="causal-columns-bar" style="flex-wrap:wrap;gap:6px;padding:6px 12px;border-bottom:1px solid var(--border);min-height:34px;"></div>

  <main class="main main--flex">
    <div id="causal-chart" style="width:100%;height:100%;"></div>
    <div id="causal-empty-state" class="plot-empty-state" data-empty-reason="no-columns-selected">
      <strong>No causal graph yet</strong>
      <span>Select at least two numeric columns above, then click Compute to build the graph.</span>
    </div>
    <div id="causal-loading" class="chart-loading-overlay" hidden>
      <div class="chart-loading-spinner"></div>
      <span class="chart-loading-label">Running causal discovery…</span>
    </div>
  </main>

  <div id="causal-ctx-menu" class="causal-ctx-menu" hidden>
    <button class="causal-ctx-item" id="causal-ctx-edit" type="button">✎ Edit attributes</button>
    <button class="causal-ctx-item causal-ctx-danger" id="causal-ctx-delete" type="button">✕ Delete</button>
  </div>

  <div id="causal-edit-panel" class="causal-edit-panel" hidden>
    <div class="causal-edit-header">
      <span id="causal-edit-title">Edit</span>
      <button class="causal-edit-close" id="causal-edit-close" type="button" aria-label="Close">✕</button>
    </div>
    <div id="causal-edit-body" class="causal-edit-body"></div>
    <div class="causal-edit-footer">
      <button class="btn btn-accent btn-sm" id="causal-edit-apply" type="button">Apply</button>
      <button class="btn btn-ghost btn-sm causal-ctx-danger" id="causal-edit-delete" type="button">Delete</button>
    </div>
  </div>

  <div id="causal-compare-panel" class="causal-compare-panel">
    <div class="causal-compare-panel-header">
      <span class="toolbar-label">Run Comparison</span>
      <select id="causal-compare-run-a" class="modal-select" aria-label="Run A"></select>
      <span class="causal-compare-vs">vs</span>
      <select id="causal-compare-run-b" class="modal-select" aria-label="Run B"></select>
      <button id="causal-compare-run-btn" class="btn btn-ghost btn-sm" type="button">Compare</button>
      <button id="causal-compare-clear-btn" class="btn btn-ghost btn-sm causal-compare-clear-btn" type="button" title="Delete all saved runs">Clear All</button>
    </div>
    <div id="causal-saved-runs-list" class="causal-saved-runs-list"></div>
    <div id="causal-compare-results" class="causal-compare-results"></div>
  </div>
</section>
```

---

## Screenshots

- `docs/screenshots/causal.png` — empty state with guidance

---

## Notes

- The ⓘ info icons are keyboard-accessible (`tabindex="0"`) and show algorithm references via `data-causal-tip` attributes.
- "PC α" and "Max conds" are disabled in the UI for FullCI and BivCI methods (those methods don't run the PC stage).
- The causal graph is rendered in `causal-chart` div. Nodes are columns; directed edges represent causal links with lag and p-value.
- "Open in Causal" from the Scatter page pre-selects the X/Y pair as the initial two columns.