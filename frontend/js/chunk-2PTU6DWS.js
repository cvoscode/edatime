import {
  toast
} from "./chunk-T63Y6LQO.js";

// frontend/src/causal/causalComparison.ts
var STORAGE_KEY = "edatime-causal-runs";
var NUMERIC_CHANGE_EPSILON = 1e-6;
var _savedRuns = [];
function generateId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
function loadSavedRuns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    _savedRuns = Array.isArray(parsed) ? parsed : [];
  } catch {
    _savedRuns = [];
  }
  return _savedRuns;
}
function persistRuns() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_savedRuns));
  } catch {
  }
}
function saveRun(links, columns, params, label) {
  const run = {
    id: generateId(),
    label: label || `${params.method} \u03C4=${params.tauMax} \u03B1=${params.alpha}`,
    timestamp: Date.now(),
    ...params,
    columns: [...columns],
    links: links.map((l) => ({ ...l }))
  };
  _savedRuns.unshift(run);
  if (_savedRuns.length > 20) _savedRuns = _savedRuns.slice(0, 20);
  persistRuns();
  return run;
}
function deleteRun(id) {
  _savedRuns = _savedRuns.filter((r) => r.id !== id);
  persistRuns();
}
function clearAllRuns() {
  _savedRuns = [];
  persistRuns();
}
function edgeDiff(runA, runB) {
  const keyA = /* @__PURE__ */ new Map();
  const keyB = /* @__PURE__ */ new Map();
  for (const l of runA.links) keyA.set(`${l.source}\u2192${l.target}@${l.lag}`, l);
  for (const l of runB.links) keyB.set(`${l.source}\u2192${l.target}@${l.lag}`, l);
  const added = [];
  const removed = [];
  const changed = [];
  const numbersDiffer = (left, right) => {
    if (!Number.isFinite(left) && !Number.isFinite(right)) return false;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
    return Math.abs(left - right) > NUMERIC_CHANGE_EPSILON;
  };
  for (const [k, lb] of keyB) {
    if (keyA.has(k)) {
      const la = keyA.get(k);
      const changes = [];
      if (la.type !== lb.type) changes.push(`Type: ${la.type} \u2192 ${lb.type}`);
      if (numbersDiffer(la.value, lb.value)) changes.push(`Strength: ${formatDiffMetric(la.value)} \u2192 ${formatDiffMetric(lb.value)}`);
      if (numbersDiffer(la.pvalue, lb.pvalue)) changes.push(`p-value: ${formatDiffMetric(la.pvalue)} \u2192 ${formatDiffMetric(lb.pvalue)}`);
      if (changes.length > 0) changed.push({ key: k, a: la, b: lb, changes });
    } else {
      added.push(lb);
    }
  }
  for (const [k, la] of keyA) {
    if (!keyB.has(k)) removed.push(la);
  }
  return { added, removed, changed };
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatDiffMetric(value) {
  if (!Number.isFinite(value)) return "\u2014";
  return Math.abs(value) >= 1e3 || Math.abs(value) > 0 && Math.abs(value) < 1e-3 ? value.toExponential(2) : value.toFixed(3);
}
function renderRunSelector(containerId, runs, selectedId, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (runs.length === 0) {
    el.innerHTML = '<option value="">No saved runs</option>';
    return;
  }
  el.innerHTML = '<option value="">-- select run --</option>' + runs.map((r) => `<option value="${escHtml(r.id)}" ${r.id === selectedId ? "selected" : ""}>${escHtml(r.label)} (${new Date(r.timestamp).toLocaleString()})</option>`).join("");
  el.addEventListener("change", () => {
    const val = el.value;
    if (val) onSelect(val);
  });
}
function renderDiff(runA, runB) {
  const { added, removed, changed } = edgeDiff(runA, runB);
  const linkRow = (l, cls, prefix) => `<tr class="${cls}"><td>${prefix} ${escHtml(l.source)}</td><td>\u2192</td><td>${escHtml(l.target)}</td><td>\u03C4=${l.lag}</td><td>${escHtml(l.type)}</td><td>${l.pvalue?.toFixed(3) ?? "\u2014"}</td></tr>`;
  const changedRows = changed.map(
    (c) => `<tr class="diff-changed"><td>${escHtml(c.a.source)}</td><td>\u2192</td><td>${escHtml(c.a.target)}</td><td>\u03C4=${c.a.lag}</td><td colspan="2">${c.changes.map((change) => escHtml(change)).join("<br>")}</td></tr>`
  ).join("");
  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return '<p style="color:var(--text-muted,#888);padding:8px 0">Graphs are identical (same edges).</p>';
  }
  return `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="color:var(--text-dim,#aaa)"><th>From</th><th></th><th>To</th><th>Lag</th><th>Type</th><th>p-value</th></tr></thead>
            <tbody>
                ${removed.map((l) => linkRow(l, "diff-removed", "\u2212")).join("")}
                ${added.map((l) => linkRow(l, "diff-added", "+")).join("")}
                ${changedRows}
            </tbody>
        </table>
        <div style="font-size:11px;color:var(--text-dim,#aaa);margin-top:6px">
            <span style="color:#f44">\u2212${removed.length} removed</span> &nbsp;
            <span style="color:#4c4">+${added.length} added</span> &nbsp;
            ${changed.length > 0 ? `<span style="color:#ffc041">${changed.length} changed edges</span>` : ""}
        </div>`;
}
var _compareRunAId = null;
var _compareRunBId = null;
function initCausalComparison() {
  loadSavedRuns();
  document.getElementById("causal-save-run-btn")?.addEventListener("click", () => {
    const method = document.getElementById("causal-method-select")?.value || "pcmci";
    const test = document.getElementById("causal-test-select")?.value || "par_corr";
    const tauMax = parseInt(document.getElementById("causal-tau-max")?.value || "3", 10);
    const alpha = parseFloat(document.getElementById("causal-alpha")?.value || "0.05");
    const graphState = window.__edatimeCausalGraph;
    if (!graphState || !graphState.links || graphState.links.length === 0) {
      toast("No causal graph to save. Run Compute first.", "warning");
      return;
    }
    const run = saveRun(graphState.links, graphState.columns, { method, test, tauMax, alpha });
    toast(`Saved run "${run.label}"`, "success");
    refreshCompareUI();
  });
  refreshCompareUI();
  document.getElementById("causal-compare-run-btn")?.addEventListener("click", () => {
    const a = _compareRunAId ? _savedRuns.find((r) => r.id === _compareRunAId) : null;
    const b = _compareRunBId ? _savedRuns.find((r) => r.id === _compareRunBId) : null;
    const results = document.getElementById("causal-compare-results");
    if (!a || !b) {
      toast("Select two runs to compare.", "warning");
      return;
    }
    if (results) results.innerHTML = renderDiff(a, b);
  });
  document.getElementById("causal-compare-clear-btn")?.addEventListener("click", () => {
    if (confirm("Delete all saved causal runs?")) {
      clearAllRuns();
      refreshCompareUI();
      toast("All saved runs cleared.", "success");
    }
  });
}
function refreshCompareUI() {
  renderRunSelector("causal-compare-run-a", _savedRuns, _compareRunAId, (id) => {
    _compareRunAId = id;
  });
  renderRunSelector("causal-compare-run-b", _savedRuns, _compareRunBId, (id) => {
    _compareRunBId = id;
  });
  const savedList = document.getElementById("causal-saved-runs-list");
  if (savedList) {
    if (_savedRuns.length === 0) {
      savedList.innerHTML = '<p style="color:var(--text-muted,#888);font-size:12px">No saved runs yet.</p>';
    } else {
      savedList.innerHTML = _savedRuns.map((r) => `
                <div class="causal-run-item" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">
                    <span>${escHtml(r.label)}</span>
                    <span style="color:var(--text-dim,#aaa)">${r.links.length} edges \xB7 ${new Date(r.timestamp).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-xs causal-run-delete-btn" data-run-id="${escHtml(r.id)}" type="button" title="Delete">\u2715</button>
                </div>`).join("");
      savedList.querySelectorAll(".causal-run-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          deleteRun(btn.dataset.runId);
          refreshCompareUI();
        });
      });
    }
  }
}
function notifyCausalGraphUpdated(columns, links) {
  window.__edatimeCausalGraph = { columns, links };
}

export {
  loadSavedRuns,
  saveRun,
  deleteRun,
  clearAllRuns,
  initCausalComparison,
  notifyCausalGraphUpdated
};
//# sourceMappingURL=chunk-2PTU6DWS.js.map
