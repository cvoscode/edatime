/**
 * driftPage.ts — Temporal Distribution & Drift Analysis page.
 *
 * Renders box plot / violin / ECDF / histogram views across temporal windows
 * and runs KS test, Wasserstein distance, and PSI against a reference window.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface WindowDistributionStats {
    start_ms: number;
    end_ms: number;
    label: string;
    count: number;
    null_count: number;
    completeness: number;
    mean: number;
    std: number;
    min: number;
    max: number;
    /** [q5, q25, q50, q75, q95] */
    quantiles: number[];
    hist_bins: number[];
    hist_counts: number[];
    ecdf_x: number[];
    ecdf_y: number[];
}

interface DriftWindowStats extends WindowDistributionStats {
    ks_stat: number;
    ks_pvalue: number;
    es_stat: number;
    es_pvalue: number;
    wasserstein: number;
    psi: number;
    drift_level: 'green' | 'yellow' | 'red';
    low_sample_warning: boolean;
}

interface DriftResponse {
    column: string;
    reference: WindowDistributionStats;
    windows: DriftWindowStats[];
    thresholds: {
        ks_threshold: number;
        wasserstein_threshold: number;
        psi_minor_threshold: number;
        psi_major_threshold: number;
    };
    metadata?: {
        computation_time_ms: number;
        num_windows: number;
        reference_samples: number;
    };
}

// ── Palette ────────────────────────────────────────────────────────────────

const COLOR_GREEN  = '#00C896';
const COLOR_YELLOW = '#FFC041';
const COLOR_RED    = '#FF6B6B';
const COLOR_DIM    = 'rgba(120,139,174,0.35)';
const COLOR_REF    = 'rgba(0,168,255,0.55)';
const COLOR_TEXT   = '#D2DAF0';
const COLOR_TEXT_DIM = '#788BAE';
const COLOR_BORDER = 'rgba(255,255,255,0.07)';

function driftColor(level: string): string {
    if (level === 'red') return COLOR_RED;
    if (level === 'yellow') return COLOR_YELLOW;
    return COLOR_GREEN;
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

function resizeCanvas(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
}

function cssW(canvas: HTMLCanvasElement): number {
    return canvas.getBoundingClientRect().width;
}

function cssH(canvas: HTMLCanvasElement): number {
    return canvas.getBoundingClientRect().height;
}

// ── Timeline chart: box plot / violin / placeholder ────────────────────────

const TIMELINE_PAD = { top: 24, right: 16, bottom: 56, left: 52 };

function drawTimeline(
    canvas: HTMLCanvasElement,
    response: DriftResponse,
    plotType: string,
    selectedIdx: number | null,
): void {
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = cssW(canvas);
    const H = cssH(canvas);
    const { top, right, bottom, left } = TIMELINE_PAD;
    const plotW = W - left - right;
    const plotH = H - top - bottom;

    ctx.clearRect(0, 0, W, H);

    const windows = response.windows;
    const ref = response.reference;
    const n = windows.length;
    if (n === 0) return;

    // Y-axis: global min/max across reference + all windows
    let yMin = ref.min;
    let yMax = ref.max;
    for (const w of windows) {
        if (isFinite(w.min) && w.min < yMin) yMin = w.min;
        if (isFinite(w.max) && w.max > yMax) yMax = w.max;
    }
    const yRange = yMax - yMin || 1;
    const toY = (v: number) => top + plotH - ((v - yMin) / yRange) * plotH;

    // X layout
    const slotW = plotW / (n + 1); // +1 slot for reference on left
    const boxW = Math.min(slotW * 0.55, 28);

    function slotX(idx: number): number {
        // idx = -1 → reference; 0..n-1 → windows
        return left + (idx + 1.5) * slotW;
    }

    // Gridlines
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    const nYTicks = 5;
    ctx.font = `10px system-ui`;
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.textAlign = 'right';
    for (let i = 0; i <= nYTicks; i++) {
        const v = yMin + (i / nYTicks) * yRange;
        const y = toY(v);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(W - right, y);
        ctx.stroke();
        ctx.fillText(formatValue(v), left - 4, y + 3.5);
    }

    // Draw reference box
    drawBoxOrViolin(ctx, ref, slotX(-1), boxW, toY, plotType, COLOR_REF, COLOR_REF, false);

    // Reference x-label
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.textAlign = 'center';
    ctx.font = '9px system-ui';
    drawRotatedLabel(ctx, 'Ref', slotX(-1), top + plotH + 8, -35);

    // Draw window boxes
    for (let i = 0; i < n; i++) {
        const w = windows[i];
        const color = w.count < 5 ? COLOR_DIM : driftColor(w.drift_level);
        const isSelected = i === selectedIdx;

        if (isSelected) {
            ctx.fillStyle = 'rgba(0,168,255,0.08)';
            ctx.fillRect(slotX(i) - slotW / 2, top, slotW, plotH);
        }

        drawBoxOrViolin(ctx, w, slotX(i), boxW, toY, plotType, color, color, isSelected);

        // x-label
        ctx.fillStyle = isSelected ? COLOR_TEXT : COLOR_TEXT_DIM;
        ctx.textAlign = 'center';
        ctx.font = isSelected ? '9.5px system-ui' : '9px system-ui';
        drawRotatedLabel(ctx, w.label, slotX(i), top + plotH + 8, -35);

        // Traffic light dot
        if (w.count >= 5) {
            ctx.fillStyle = driftColor(w.drift_level);
            ctx.beginPath();
            ctx.arc(slotX(i), top + plotH + 42, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Axes
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotH);
    ctx.lineTo(W - right, top + plotH);
    ctx.stroke();

    // Column label at top
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(response.column, left, top - 6);
}

function drawBoxOrViolin(
    ctx: CanvasRenderingContext2D,
    stats: WindowDistributionStats,
    cx: number,
    bw: number,
    toY: (v: number) => number,
    plotType: string,
    strokeColor: string,
    fillColor: string,
    selected: boolean,
): void {
    const [q5, q25, q50, q75, q95] = stats.quantiles;
    if (!isFinite(q5) || stats.count === 0) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = selected ? 2 : 1.5;

    if (plotType === 'violin') {
        drawViolin(ctx, stats, cx, bw, toY, strokeColor, fillColor);
        return;
    }

    // Box plot
    const yQ5  = toY(q5);
    const yQ25 = toY(q25);
    const yQ50 = toY(q50);
    const yQ75 = toY(q75);
    const yQ95 = toY(q95);

    // Whiskers
    ctx.beginPath();
    ctx.moveTo(cx, yQ5);
    ctx.lineTo(cx, yQ25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, yQ75);
    ctx.lineTo(cx, yQ95);
    ctx.stroke();
    // Whisker caps
    const capW = bw * 0.4;
    ctx.beginPath(); ctx.moveTo(cx - capW, yQ5);  ctx.lineTo(cx + capW, yQ5);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - capW, yQ95); ctx.lineTo(cx + capW, yQ95); ctx.stroke();

    // Box fill
    const alpha = selected ? 0.22 : 0.12;
    ctx.fillStyle = hexToRgba(fillColor, alpha);
    ctx.fillRect(cx - bw / 2, yQ75, bw, yQ25 - yQ75);

    // Box border
    ctx.strokeRect(cx - bw / 2, yQ75, bw, yQ25 - yQ75);

    // Median line
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = selected ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, yQ50);
    ctx.lineTo(cx + bw / 2, yQ50);
    ctx.stroke();
    ctx.lineWidth = selected ? 2 : 1.5;
}

function drawViolin(
    ctx: CanvasRenderingContext2D,
    stats: WindowDistributionStats,
    cx: number,
    maxHalfW: number,
    toY: (v: number) => number,
    strokeColor: string,
    fillColor: string,
): void {
    // Use histogram as density proxy
    const counts = stats.hist_counts;
    const bins   = stats.hist_bins;
    if (counts.length === 0 || bins.length < 2) return;

    const maxCnt = Math.max(...counts, 1);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < counts.length; i++) {
        const halfW = (counts[i] / maxCnt) * maxHalfW;
        const binMid = (bins[i] + bins[i + 1]) / 2;
        pts.push([halfW, toY(binMid)]);
    }

    // Right outline
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
        const [hw, y] = pts[i];
        if (i === 0) ctx.moveTo(cx + hw, y);
        else ctx.lineTo(cx + hw, y);
    }
    // Left outline (reversed)
    for (let i = pts.length - 1; i >= 0; i--) {
        const [hw, y] = pts[i];
        ctx.lineTo(cx - hw, y);
    }
    ctx.closePath();
    ctx.fillStyle = hexToRgba(fillColor, 0.18);
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Median tick
    const [, q25, q50, q75] = stats.quantiles;
    if (isFinite(q50)) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        const y50 = toY(q50);
        const halfW50 = maxHalfW * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - halfW50, y50);
        ctx.lineTo(cx + halfW50, y50);
        ctx.stroke();
    }
    ctx.lineWidth = 1.5;
}

function drawRotatedLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    angleDeg: number,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

// ── Detail panel: ECDF / histogram overlay ─────────────────────────────────

const DETAIL_PAD = { top: 20, right: 16, bottom: 40, left: 44 };

function drawDetail(
    canvas: HTMLCanvasElement,
    ref: WindowDistributionStats,
    win: WindowDistributionStats | null,
    plotType: string,
): void {
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = cssW(canvas);
    const H = cssH(canvas);
    const { top, right, bottom, left } = DETAIL_PAD;
    const plotW = W - left - right;
    const plotH = H - top - bottom;

    ctx.clearRect(0, 0, W, H);

    // Gridlines + axes
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = top + (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(W - right, y); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotH);
    ctx.lineTo(W - right, top + plotH);
    ctx.stroke();

    if (plotType === 'histogram') {
        drawHistogramOverlay(ctx, ref, win, left, top, plotW, plotH);
    } else {
        drawECDFOverlay(ctx, ref, win, left, top, plotW, plotH);
    }

    // Legend
    const refLabel = 'Reference';
    const winLabel = win ? win.label : '—';
    ctx.font = '9px system-ui';
    ctx.fillStyle = COLOR_REF; ctx.fillRect(left + 4, top + 6, 10, 3);
    ctx.fillStyle = COLOR_TEXT_DIM; ctx.fillText(refLabel, left + 18, top + 10);
    if (win) {
        const col = win.count < 5 ? COLOR_DIM : driftColor((win as DriftWindowStats).drift_level || 'green');
        ctx.fillStyle = col; ctx.fillRect(left + 4, top + 18, 10, 3);
        ctx.fillStyle = COLOR_TEXT_DIM; ctx.fillText(winLabel, left + 18, top + 22);
    }
}

function drawHistogramOverlay(
    ctx: CanvasRenderingContext2D,
    ref: WindowDistributionStats,
    win: WindowDistributionStats | null,
    px: number, py: number, pw: number, ph: number,
): void {
    const bins  = ref.hist_bins;
    const refCounts = ref.hist_counts;
    const winCounts = win?.hist_counts ?? [];
    const n = bins.length - 1;
    if (n <= 0) return;

    const maxCnt = Math.max(...refCounts, ...(winCounts.length ? winCounts : [0]), 1);
    const xMin = bins[0];
    const xMax = bins[bins.length - 1];
    const xRange = xMax - xMin || 1;

    const toX = (v: number) => px + ((v - xMin) / xRange) * pw;
    const toY = (cnt: number) => py + ph - (cnt / maxCnt) * ph;

    for (let i = 0; i < n; i++) {
        const x0 = toX(bins[i]);
        const x1 = toX(bins[i + 1]);
        const bw = Math.max(x1 - x0 - 1, 1);

        // Reference bar
        const ry = toY(refCounts[i] || 0);
        ctx.fillStyle = hexToRgba(COLOR_REF, 0.3);
        ctx.fillRect(x0, ry, bw, py + ph - ry);
        ctx.strokeStyle = hexToRgba(COLOR_REF, 0.7);
        ctx.strokeRect(x0, ry, bw, py + ph - ry);

        // Current bar
        if (winCounts.length > i) {
            const col = win && win.count >= 5
                ? driftColor((win as DriftWindowStats).drift_level)
                : COLOR_DIM;
            const wy = toY(winCounts[i] || 0);
            ctx.fillStyle = hexToRgba(col, 0.18);
            ctx.fillRect(x0, wy, bw, py + ph - wy);
            ctx.strokeStyle = hexToRgba(col, 0.6);
            ctx.strokeRect(x0, wy, bw, py + ph - wy);
        }
    }

    // X-axis labels
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(xMin), px, py + ph + 14);
    ctx.fillText(formatValue((xMin + xMax) / 2), px + pw / 2, py + ph + 14);
    ctx.fillText(formatValue(xMax), px + pw, py + ph + 14);

    // Y-axis label
    ctx.textAlign = 'right';
    ctx.fillText('0', px - 4, py + ph + 3.5);
    ctx.fillText(String(maxCnt), px - 4, py + 10);
}

function drawECDFOverlay(
    ctx: CanvasRenderingContext2D,
    ref: WindowDistributionStats,
    win: WindowDistributionStats | null,
    px: number, py: number, pw: number, ph: number,
): void {
    const xMin = Math.min(ref.min, win?.min ?? Infinity, isFinite(win?.min ?? Infinity) ? win!.min : ref.min);
    const xMax = Math.max(ref.max, win?.max ?? -Infinity, isFinite(win?.max ?? -Infinity) ? win!.max : ref.max);
    const xRange = xMax - xMin || 1;

    const toX = (v: number) => px + ((v - xMin) / xRange) * pw;
    const toY = (p: number) => py + ph - p * ph;

    // Draw ECDF line
    function drawECDF(xs: number[], ys: number[], color: string): void {
        if (xs.length === 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(toX(xs[0]), toY(ys[0]));
        for (let i = 1; i < xs.length; i++) {
            // Step function: horizontal then vertical
            ctx.lineTo(toX(xs[i]), toY(ys[i - 1]));
            ctx.lineTo(toX(xs[i]), toY(ys[i]));
        }
        ctx.stroke();
    }

    drawECDF(ref.ecdf_x, ref.ecdf_y, hexToRgba(COLOR_REF, 0.9));
    if (win && win.ecdf_x.length > 0) {
        const col = win.count < 5
            ? COLOR_DIM
            : driftColor((win as DriftWindowStats).drift_level);
        drawECDF(win.ecdf_x, win.ecdf_y, col);
    }

    // Axis labels
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(xMin), px, py + ph + 14);
    ctx.fillText(formatValue((xMin + xMax) / 2), px + pw / 2, py + ph + 14);
    ctx.fillText(formatValue(xMax), px + pw, py + ph + 14);
    ctx.textAlign = 'right';
    ctx.fillText('0', px - 4, py + ph + 3.5);
    ctx.fillText('1', px - 4, py + 10);

    // Y axis title
    ctx.save();
    ctx.translate(px - 30, py + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('CDF', 0, 0);
    ctx.restore();
}

// ── Utility helpers ─────────────────────────────────────────────────────────

function formatValue(v: number): string {
    if (!isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
    if (abs >= 10)  return v.toFixed(1);
    if (abs >= 1)   return v.toFixed(2);
    if (abs >= 0.01) return v.toFixed(4);
    if (abs === 0)  return '0';
    return v.toExponential(2);
}

function hexToRgba(hex: string, alpha: number): string {
    // Handles "#rrggbb" or "rgba(...)" pass-through
    if (hex.startsWith('rgba') || hex.startsWith('rgb(')) {
        // Replace last alpha if rgba
        return hex.replace(/[\d.]+\)$/, `${alpha})`);
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function formatMs(ms: number): string {
    if (!isFinite(ms)) return '—';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toDatetimeLocal(ms: number): string {
    if (!isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Skeleton loading canvas (L2) ───────────────────────────────────────────

function drawSkeleton(canvas: HTMLCanvasElement): void {
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = cssW(canvas);
    const H = cssH(canvas);
    ctx.clearRect(0, 0, W, H);

    // Draw muted placeholder bars to indicate loading
    const barCount = 8;
    const pad = { top: 24, right: 16, bottom: 56, left: 52 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;
    const slotW = plotW / barCount;
    const heights = [0.6, 0.4, 0.75, 0.5, 0.85, 0.45, 0.65, 0.55];

    for (let i = 0; i < barCount; i++) {
        const bh = plotH * heights[i % heights.length];
        const x = pad.left + i * slotW + slotW * 0.2;
        const bw = slotW * 0.6;
        ctx.fillStyle = 'rgba(120,139,174,0.10)';
        ctx.fillRect(x, pad.top + plotH - bh, bw, bh);
    }

    // Center label
    ctx.fillStyle = 'rgba(120,139,174,0.35)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Computing…', W / 2, H / 2);
}

// ── Page init ───────────────────────────────────────────────────────────────

export async function initDriftPage(metadata: any): Promise<void> {
    const colSelect        = document.getElementById('drift-col-select')        as HTMLSelectElement | null;
    const windowSelect     = document.getElementById('drift-window-select')     as HTMLSelectElement | null;
    const plotTypeSelect   = document.getElementById('drift-plot-type')         as HTMLSelectElement | null;
    const refStartInput    = document.getElementById('drift-ref-start')         as HTMLInputElement | null;
    const refEndInput      = document.getElementById('drift-ref-end')           as HTMLInputElement | null;
    const computeBtn       = document.getElementById('drift-compute-btn')       as HTMLButtonElement | null;
    const statusEl         = document.getElementById('drift-status')            as HTMLElement | null;
    const timelineCanvas   = document.getElementById('drift-timeline-canvas')   as HTMLCanvasElement | null;
    const detailCanvas     = document.getElementById('drift-detail-canvas')     as HTMLCanvasElement | null;
    const loadingOverlay   = document.getElementById('drift-loading')           as HTMLElement | null;
    const emptyState       = document.getElementById('drift-empty')             as HTMLElement | null;
    const detailHeader     = document.getElementById('drift-detail-header')     as HTMLElement | null;
    const detailStatsEl    = document.getElementById('drift-detail-stats')      as HTMLElement | null;
    const windowListEl     = document.getElementById('drift-window-list')       as HTMLElement | null;

    if (!timelineCanvas || !detailCanvas || !colSelect) return;

    // ── Populate column selector ──
    const numericCols: string[] = Array.isArray(metadata?.numeric_columns)
        ? metadata.numeric_columns.filter((c: string) => c && c.toLowerCase() !== 'ts')
        : [];
    for (const col of numericCols) {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        colSelect.appendChild(opt);
    }

    // ── Default reference range: first half of dataset (leaves second half for monitoring) ──
    // metadata.time_range = { min: epochMs, max: epochMs }
    const timeRange = metadata?.time_range as { min: number; max: number } | undefined;
    if (timeRange?.min != null && timeRange?.max != null) {
        const midMs = timeRange.min + (timeRange.max - timeRange.min) / 2;
        if (refStartInput) refStartInput.value = toDatetimeLocal(timeRange.min);
        if (refEndInput)   refEndInput.value   = toDatetimeLocal(midMs);
    }

    // ── State ──
    let currentResponse: DriftResponse | null = null;
    let selectedWindowIdx: number | null = null;

    // ── Rendering helpers ──
    function renderTimeline(): void {
        if (!currentResponse || !timelineCanvas) return;
        const plotType = plotTypeSelect?.value || 'box';
        drawTimeline(timelineCanvas, currentResponse, plotType, selectedWindowIdx);
    }

    function renderDetail(): void {
        if (!detailCanvas || !currentResponse) return;
        const plotType = plotTypeSelect?.value || 'box';
        const detailType = (plotType === 'histogram' || plotType === 'ecdf') ? plotType : 'ecdf';
        const win = selectedWindowIdx !== null ? currentResponse.windows[selectedWindowIdx] : null;
        drawDetail(detailCanvas, currentResponse.reference, win, detailType);
    }

    function renderWindowList(): void {
        if (!windowListEl || !currentResponse) return;
        windowListEl.innerHTML = '';
        currentResponse.windows.forEach((w, idx) => {
            const item = document.createElement('div');
            item.className = 'drift-window-item' + (idx === selectedWindowIdx ? ' selected' : '');
            const badgeClass = w.count < 5 ? 'empty' : w.drift_level;
            item.innerHTML = `
                <span class="drift-window-badge drift-window-badge--${badgeClass}"></span>
                <span class="drift-window-label">${w.label}</span>
                <span class="drift-window-psi">PSI ${isFinite(w.psi) ? w.psi.toFixed(3) : '—'}</span>
            `;
            item.addEventListener('click', () => {
                selectedWindowIdx = idx;
                renderTimeline();
                renderDetail();
                updateDetailStats();
                renderWindowList();
            });
            windowListEl.appendChild(item);
        });
    }

    function updateDetailStats(): void {
        if (!detailStatsEl || !currentResponse) return;
        const win = selectedWindowIdx !== null ? currentResponse.windows[selectedWindowIdx] : null;

        if (!win) {
            detailStatsEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">Select a window to see stats</span>';
            if (detailHeader) detailHeader.textContent = 'Window Detail';
            return;
        }

        if (detailHeader) {
            detailHeader.textContent = win.label + (win.low_sample_warning ? ' ⚠ Low N' : '');
        }

        const levelClass = `drift-${win.drift_level}`;
        const rows: Array<[string, string, string?]> = [
            ['Count', String(win.count)],
            ['Completeness', `${(win.completeness * 100).toFixed(1)}%`],
            ['Mean', formatValue(win.mean)],
            ['Std', formatValue(win.std)],
            ['Median (Q50)', formatValue(win.quantiles[2])],
            ['KS stat / p', `${win.ks_stat.toFixed(3)} / ${win.ks_pvalue.toFixed(3)}`],
            ['E-S stat / p', `${isFinite(win.es_stat) ? win.es_stat.toFixed(3) : '—'} / ${isFinite(win.es_pvalue) ? win.es_pvalue.toFixed(3) : '—'}`],
            ['Wasserstein', formatValue(win.wasserstein)],
            ['PSI', win.psi.toFixed(4), levelClass],
            ['Drift level', win.drift_level.toUpperCase(), levelClass],
        ];
        if (win.low_sample_warning) {
            rows.unshift(['⚠ Low sample size', 'N < 5, stats unreliable']);
        }

        detailStatsEl.innerHTML = rows.map(([label, value, cls]) => `
            <div class="drift-detail-stat-row">
                <span class="drift-detail-stat-label">${label}</span>
                <span class="drift-detail-stat-value${cls ? ' ' + cls : ''}">${value}</span>
            </div>
        `).join('');
    }

    function syncEmptyState(show: boolean, message?: string): void {
        if (!emptyState) return;
        if (message) emptyState.innerHTML = `<strong>No drift data</strong><span>${message}</span>`;
        emptyState.hidden = !show;
    }

    // ── Compute ──
    async function runCompute(): Promise<void> {
        if (!computeBtn) return;
        const column = colSelect?.value;
        if (!column) {
            if (statusEl) statusEl.textContent = 'Select a column first.';
            return;
        }
        const refStart = refStartInput?.value;
        const refEnd   = refEndInput?.value;
        if (!refStart || !refEnd) {
            if (statusEl) statusEl.textContent = 'Set reference start and end dates.';
            return;
        }

        computeBtn.disabled = true;
        computeBtn.textContent = 'Computing…';
        if (loadingOverlay) loadingOverlay.hidden = false;
        syncEmptyState(false);
        if (statusEl) statusEl.textContent = 'Computing drift…';
        // Show skeleton on canvases while computing (L2)
        if (timelineCanvas) drawSkeleton(timelineCanvas);
        if (detailCanvas) drawSkeleton(detailCanvas);
        timelineCanvas?.classList.add('drift-loading');
        detailCanvas?.classList.add('drift-loading');

        try {
            const body: Record<string, unknown> = {
                column,
                window: windowSelect?.value || 'daily',
                reference_start: new Date(refStart).toISOString(),
                reference_end:   new Date(refEnd).toISOString(),
            };

            const res = await fetch('/api/drift/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`${res.status}: ${text || res.statusText}`);
            }
            currentResponse = await res.json() as DriftResponse;
            selectedWindowIdx = currentResponse.windows.length > 0 ? 0 : null;

            const nWindows = currentResponse.windows.length;
            const nDrifting = currentResponse.windows.filter(w => w.drift_level !== 'green').length;
            const ms = currentResponse.metadata?.computation_time_ms;
            const timeStr = ms != null ? ` · ${ms}ms` : '';
            if (statusEl) {
                statusEl.textContent = `${column} · ${nWindows} windows · ${nDrifting} flagged · Ref: ${currentResponse.reference.count} samples${timeStr}`;
            }

            renderTimeline();
            renderDetail();
            renderWindowList();
            updateDetailStats();
            syncEmptyState(nWindows === 0, nWindows === 0 ? 'No data found in the monitoring range after the reference window.' : undefined);

            // Enable export buttons (H1)
            (['drift-export-png', 'drift-export-detail-png', 'drift-export-csv', 'drift-export-json'] as const)
                .forEach(id => {
                    const btn = document.getElementById(id) as HTMLButtonElement | null;
                    if (btn) btn.disabled = false;
                });

        } catch (err: any) {
            console.error('Drift compute failed:', err);
            if (statusEl) statusEl.textContent = `Error: ${err?.message || 'unknown'}`;
            syncEmptyState(true, err?.message || 'Computation failed. Check column and date ranges.');
        } finally {
            if (loadingOverlay) loadingOverlay.hidden = true;
            computeBtn.disabled = false;
            computeBtn.textContent = 'Compute';
            timelineCanvas?.classList.remove('drift-loading');
            detailCanvas?.classList.remove('drift-loading');
        }
    }

    computeBtn?.addEventListener('click', runCompute);

    // ── Plot type change re-renders ──
    plotTypeSelect?.addEventListener('change', () => {
        renderTimeline();
        renderDetail();
    });

    // ── Canvas click: select window ──
    timelineCanvas.addEventListener('click', (e: MouseEvent) => {
        if (!currentResponse || currentResponse.windows.length === 0) return;
        const rect = timelineCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const W = rect.width;
        const n = currentResponse.windows.length;
        const plotW = W - TIMELINE_PAD.left - TIMELINE_PAD.right;
        const slotW = plotW / (n + 1);

        // slot index: -1 = reference, 0..n-1 = windows
        // slotX(i) = TIMELINE_PAD.left + (i + 1.5) * slotW
        // solve: i = (clickX - TIMELINE_PAD.left) / slotW - 1.5
        const rawIdx = Math.round((clickX - TIMELINE_PAD.left) / slotW - 1.5);
        const idx = Math.max(0, Math.min(n - 1, rawIdx));
        if (rawIdx < 0) return; // clicked on reference area
        selectedWindowIdx = idx;
        renderTimeline();
        renderDetail();
        updateDetailStats();
        renderWindowList();
    });

    // ── Resize observer with 150ms debounce (M2) ──
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            renderTimeline();
            renderDetail();
        }, 150);
    });
    ro.observe(timelineCanvas);
    ro.observe(detailCanvas);

    // ── Export helpers (H1) ──
    function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
        canvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    function exportDriftCsv(): void {
        if (!currentResponse) return;
        const rows: string[] = [
            'window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,drift_level',
        ];
        for (const w of currentResponse.windows) {
            rows.push([
                w.label,
                w.start_ms,
                w.end_ms,
                w.count,
                isFinite(w.mean) ? w.mean.toFixed(6) : '',
                isFinite(w.std) ? w.std.toFixed(6) : '',
                isFinite(w.quantiles[2]) ? w.quantiles[2].toFixed(6) : '',
                w.ks_stat.toFixed(6),
                w.ks_pvalue.toFixed(6),
                isFinite(w.es_stat) ? w.es_stat.toFixed(6) : '',
                isFinite(w.es_pvalue) ? w.es_pvalue.toFixed(6) : '',
                w.wasserstein.toFixed(6),
                w.psi.toFixed(6),
                w.drift_level,
            ].join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drift_${currentResponse.column}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportDriftJson(): void {
        if (!currentResponse) return;
        const blob = new Blob([JSON.stringify(currentResponse, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drift_${currentResponse.column}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Wire export buttons
    document.getElementById('drift-export-png')?.addEventListener('click', () => {
        if (timelineCanvas) exportCanvasPng(timelineCanvas, `drift_timeline_${currentResponse?.column ?? 'chart'}.png`);
    });
    document.getElementById('drift-export-detail-png')?.addEventListener('click', () => {
        if (detailCanvas) exportCanvasPng(detailCanvas, `drift_detail_${currentResponse?.column ?? 'chart'}.png`);
    });
    document.getElementById('drift-export-csv')?.addEventListener('click', exportDriftCsv);
    document.getElementById('drift-export-json')?.addEventListener('click', exportDriftJson);

    // ── Keyboard shortcuts (M3) ──
    const driftPage = document.getElementById('page-drift');
    driftPage?.addEventListener('keydown', (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        switch (e.key) {
            case 'Enter':
            case 'd':
            case 'D':
                e.preventDefault();
                runCompute();
                break;
            case 'e':
            case 'E':
                e.preventDefault();
                exportDriftCsv();
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                exportDriftJson();
                break;
            case 'p':
            case 'P':
                if (timelineCanvas) exportCanvasPng(timelineCanvas, `drift_timeline_${currentResponse?.column ?? 'chart'}.png`);
                break;
        }
    });

    // ── Page change handler ──
    window.addEventListener('edatime:page-change', (e: any) => {
        if (e?.detail?.page === 'drift') {
            // Refresh column list if metadata has changed
            const existing = new Set(Array.from(colSelect.options).map(o => o.value));
            const cols: string[] = Array.isArray(metadata?.numeric_columns) ? metadata.numeric_columns : [];
            for (const col of cols) {
                if (!existing.has(col) && col.toLowerCase() !== 'ts') {
                    const opt = document.createElement('option');
                    opt.value = col;
                    opt.textContent = col;
                    colSelect.appendChild(opt);
                }
            }
            // Re-render if we have data
            if (currentResponse) {
                renderTimeline();
                renderDetail();
            }
        }
    });
}
