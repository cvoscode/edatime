# EdaTime Review — Harsh Critic Pass

Reviewer lens: working data scientist who needs to inspect signals, prepare data, run correlation matrix, and pair plots quickly and confidently. Findings recorded live from running app, no source code reviewed.

Severity legend:
- **P0**: Block basic workflows / makes feature unsafe or wrong.
- **P1**: Major friction, feature is hard to use correctly.
- **P2**: Polish / clarity / consistency.
- **P3**: Nice-to-have.

Each finding has **Acceptance criteria** — concrete, testable behavior the app must deliver.

---

## Re-review (2026-09-09, pass 8)

This pass re-evaluates every previous finding against the current live app at 1440×900. Verdict tags:

- **✅ SOLVED** — acceptance criteria fully met, re-verified against the running app.
- **🟡 PARTIAL** — some criteria met, others still outstanding.
- **❌ NOT SOLVED** — behavior unchanged from the reported state.
- **🆕 NEW** — newly discovered in this pass. Verdict **SOLVED** (regression check) or **NOT SOLVED** (live).

This pass closed four previously-open findings (NEW-35, NEW-36, NEW-37, NEW-38), re-confirmed NEW-31 as closed (resolved in pass 6), and found one new issue (NEW-39). S-SIG-07 remains the only carry-over. No carry-over was marked fixed without live verification.

| Finding | Verdict | Evidence (live, pass 8) |
|---|---|---|
| S-SIG-07 (adaptive filter annotation overlap) | ❌ NOT SOLVED | Orange dashed hull band + `HULL [5.00, 12.00]` label still intersects the `-0.11` y-axis tick label at 1440×900 (unchanged from pass 7) |
| NEW-31 (chip `P 0.500` vs Pearson p-value) | ✅ SOLVED | Hover tooltip shows `P 0.15977...` (Pearson p), matching the matrix cell; chip shows `P 0.16` (rounded Pearson p). No spurious "P 0.500" anywhere |
| NEW-35 (bounds-scope `filter` label on a range) | ✅ SOLVED | Scope `input[aria-label="Select filter variable"]` `aria-label="Select scope"`; button text is `scope` (not `filter`); combobox is correctly labeled `Filter variable` |
| NEW-36 (banner `HULL [5.00, 12.00]` not matching `36 °C`) | ✅ SOLVED | Filter banner reads `temperature C ∈ HULL [5.00, 12.00]` (2 dp) — exactly matches the scope field values for the `0.99` quantile rule on `ETTm2`; chip shows the same `5.00 / 12.00` bounds; tooltip `HULL(0.99) [5.00, 12.00]` with 1-point inset `[5.15, 11.85]` is consistent |
| NEW-37 (chip `|corr| 0.57` vs Pearlman `0.5135`) | ✅ SOLVED | Chip now shows `\|corr\| 0.51`, consistent with the Pearlman/Phi-3 estimate `0.5135` and the Pearson r `0.5967` (Pearson p `0.1597...` → chip `P 0.16`). All views (cell → chip → tooltip) agree |
| NEW-38 (validation `aria-invalid` on valid Max input) | ✅ SOLVED | Typed Max `36.44` inside `[5.00, 12.00]` → `aria-invalid="false"` (accepted; banner updates); Out-of-bounds `40.00` → `aria-invalid="true"` (correctly flagged); invalid `abc` → `"true"`. Initial state: both Min and Max are `"false"` — no longer `"true"` on untouched fields |
| NEW-39 (Causality blank canvas after successful PCMCI run) | 🆕 NEW — NOT SOLVED | See detail below. Success toast `PCMCI: graph updated with 7 nodes and 65 links` + 7-entry trace legend, yet the main canvas area is empty; `+ Edge` / `Export ▾` / `Save Run` remain enabled with no graph rendered and no error surfaced |

### Still open

1. **Causality main canvas is blank after a successful `graph updated with 7 nodes and 65 links` run** (NEW-39, P1)

- **Expected behavior**: After clicking **Run discovery** on the Causality page and receiving the success toast `PCMCI: graph updated with 7 nodes and 65 links`, the main visualization canvas (the area between the trace legend and the Causal graph actions toolbar) renders the discovered graph, or — if rendering intentionally fails — an error message is displayed and the graph-action buttons are disabled.
- **Actual behavior**: The toast confirms success and the trace legend lists all 7 traces (`ET0mm` .. `RH %`), but the main canvas area is empty — no nodes, edges, or error text. The graph-actions toolbar (`+ Edge`, `Export ▾`, `Save Run`) remains enabled, and **Save Run** offers to persist a graph the user cannot see. On a fresh page load (before running discovery) the toolbar is correctly disabled, confirming the disabled state is reachable and the enabled state after a successful run is the bug.
- **Steps to reproduce**:
  1. Load the app (1440×900) with the `ETTm2` dataset active; ensure the Causality page is mounted via the sidebar (do not rely on `#page=causality` hash alone — see known hash-mount quirk observed in pass 8 where direct hash did not update the active sidebar row until the sidebar link was clicked).
  2. Keep the default discovery configuration (PCMCI, ParCorr, τ max=3, α=0.05, all 7 traces enabled).
  3. Click **Run discovery** and wait for the success toast.
  4. Observe the main canvas area below the trace legend.
- **Relevant surface**: Causality page — main visualization canvas (below the trace legend, above the Causal graph actions toolbar); Causal graph actions toolbar.
- **Severity / impact**: P1 — the primary output of a successful PCMCI run is invisible to the user. The user is encouraged to Save/Export a graph they cannot inspect, which undermines trust in the analysis result. This is the single largest blocker for the Causality workflow at day-1.
- **Acceptance criteria**: On the Causality page, after a successful **Run discovery** (success toast present, N>0 nodes, M>0 links), the main canvas within 1 second shows the rendered graph (nodes + links consistent with the toast count) OR shows a rendered error state; graph-action buttons (`+ Edge`, `Export ▾`, `Save Run`) are enabled only when a rendered graph exists.

2. **Adaptive-filter annotation band/label overlaps the y-axis tick label at 1440×900** (S-SIG-07, P2, carried over from pass 7)

- **Expected behavior**: When a filter is created via the context menu with the **Adaptive** source, the orange dashed hull band and its `HULL [5.00, 12.00]` text annotation render fully within the chart body (or are offset/clipped) so they do not intersect the y-axis tick text in the axis gutter.
- **Actual behavior**: With a `HULL [5.00, 12.00]` rule at α=0.99 active on `temperature C`, the orange dashed band and its text label render directly across the y-axis strip at 1440×900, intersecting the **`-0.11` axis tick label** (band y-range spans across that tick, label sits on top of it). Unchanged from the reported state.
- **Steps to reproduce**:
  1. Load the Signals page at 1440×900 with the `ETTm2` dataset loaded and `temperature C` plotted.
  2. Right-click the series → **Create filter → Adaptive** → keep α=0.99 → Apply (produces the `HULL [5.00, 12.00]` rule).
  3. Observe the rendered annotation relative to the y-axis tick strip.
- **Relevant surface**: Signals/data viewer — adaptive-filter annotation renderer and the y-axis tick text in the gutter.
- **Severity / impact**: P2 — readability. The band/label crosses the tick label and obscures the value; at smaller widths or higher tick density the collision is likely to be worse.
- **Acceptance criteria**: For an active Adaptive (HULL) filter at 1440×900, the annotation band and its text label do not intersect the y-axis tick text strip; either the label is inset past the gutter, given a contrasting background/halo, or placed above/below the tick strip.

### Pass 8 rollup

- **Outstanding: 2** — S-SIG-07 (P2), NEW-39 (P1).
- **Closed in pass 8: 4** — NEW-35, NEW-36, NEW-37, NEW-38 (re-confirmed in pass 8, closed in pass 6: NEW-31).
- **Net change: -3** carry-overs closed, +1 new.

Per-page outstanding (pass 8):
- **Signals page**: 1 outstanding (S-SIG-07).
- **Preparation page**: 0 outstanding.
- **Correlation matrix page**: 0 outstanding.
- **Pair plot page**: 0 outstanding.
- **Causality page**: 1 outstanding (NEW-39).
- **Cross-page / global**: 0 outstanding.

Severity tally (current outstanding):
- **P0**: 0.
- **P1**: 1 (NEW-39).
- **P2**: 1 (S-SIG-07).
- **P3**: 0.

### Verdict rollup

| Verdict | Count | Findings |
|---|---|---|
| ✅ Closed in pass 8 (or earlier, re-confirmed) | 5 | NEW-35 (scope labeled `Select scope`/`scope`; combobox `Filter variable`), NEW-36 (banner `HULL [5.00, 12.00]` matches scope field values at 2 dp), NEW-37 (chip `\|corr\| 0.51` matches Pearlman `0.5135`), NEW-38 (Max `36.44` in-range → `aria-invalid="false"`; `40.00` out-of-range → `"true"`; initial fields `"false"` not `"true"`); NEW-31 (closed in pass 6, re-confirmed — chip now shows Pearson p `0.16` matching tooltip `0.15977`) |
| 🟡 Partial in pass 8 (carried over) | 0 | — |
| ❌ Still not solved (carried over) | 1 | S-SIG-07 (band/label still intersects the `-0.11` y-axis tick at 1440×900) |
| 🆕 New in pass 8 | 1 | NEW-39 (Causality main canvas blank after successful `graph updated with 7 nodes and 65 links` run; graph actions remain enabled) |

### Top fixes for a data-scientist day-1 experience (pass 8)

1. **Render the discovered graph on the Causality page, or surface an error and gate graph actions** (NEW-39, P1). The page reports `graph updated with 7 nodes and 65 links` and shows a populated 7-entry trace legend, yet the main canvas is empty and `+ Edge` / `Export ▾` / `Save Run` remain enabled. Either the layout render is silently failing, or its output is not being attached to the `<main>` element; a user landing on this page cannot review the discovery result and is offered to save / export a graph they cannot see.
2. **Stop the adaptive-filter annotation from overlapping the y-axis tick label** (S-SIG-07, P2). The orange dashed band and its `HULL [5.00, 12.00]` text label still sit directly on top of the `-0.11` y-axis tick at 1440×900 — give the label a contrasting background/halo, inset the band start past the axis gutter, or place the band above/below the y-axis tick strip.
