import {
    buildColumnSummary,
    buildGlobalSummary,
    formatTriggerReason,
    severityScore,
    type DriftInvestigationResponse,
    type DriftResponse,
    type DriftWindowStats,
} from './viewModels.js';

export interface DriftSummaryPanelHtml {
    summaryStrip: string;
    columnSummary: string;
}

interface TraceReportRow {
    column: string;
    level: DriftWindowStats['drift_level'];
    drifting: boolean;
    flaggedWindows: number;
    totalWindows: number;
    driftScore: number;
    firstChangeMs: number | null;
    evidence: string;
    trend: 'accelerating' | 'stable' | 'recovering' | 'insufficient';
    latestWasserstein: number | null;
    latestKsPvalue: number | null;
    latestCompletenessDelta: number | null;
    lowSampleWarning: boolean;
    sampleRatioWarning: boolean;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    })[character] ?? character);
}

function formatReportDate(ms: number | null): string {
    if (ms === null || !Number.isFinite(ms)) return 'None';
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(ms));
}

function strongestWindow(response: DriftResponse): DriftWindowStats | null {
    return [...response.windows].sort((left, right) => {
        const severityDelta = severityScore(right.drift_level) - severityScore(left.drift_level);
        if (severityDelta !== 0) return severityDelta;
        return right.psi - left.psi;
    })[0] ?? null;
}

function buildEvidenceLabel(window: DriftWindowStats | null): string {
    if (!window) return 'No shift detected';
    const firstReason = window.trigger_reasons[0] ?? '';
    if (firstReason.startsWith('psi')) return `PSI (${window.psi.toFixed(3)})`;
    if (firstReason === 'wasserstein') return `Wasserstein (${window.wasserstein.toFixed(3)})`;
    if (firstReason === 'ks') return `KS p-value (${window.ks_pvalue.toFixed(3)})`;
    if (firstReason === 'es') return `Energy p-value (${window.es_pvalue.toFixed(3)})`;
    return firstReason ? formatTriggerReason(firstReason) : 'No threshold fired';
}

function buildTrend(response: DriftResponse): TraceReportRow['trend'] {
    const windows = response.windows;
    if (windows.length < 4) return 'insufficient';
    const sampleSize = Math.min(8, Math.max(2, Math.floor(windows.length / 4)));
    const recent = windows.slice(-sampleSize);
    const prior = windows.slice(-sampleSize * 2, -sampleSize);
    if (prior.length === 0) return 'insufficient';
    const recentAvg = recent.reduce((sum, window) => sum + window.psi, 0) / recent.length;
    const priorAvg = prior.reduce((sum, window) => sum + window.psi, 0) / prior.length;
    const delta = recentAvg - priorAvg;
    if (delta > 0.05) return 'accelerating';
    if (delta < -0.05) return 'recovering';
    return 'stable';
}

function trendBadge(trend: TraceReportRow['trend']): string {
    switch (trend) {
        case 'accelerating': return '<span class="drift-trend drift-trend--up" title="PSI trending up in the last windows">↑ accelerating</span>';
        case 'recovering': return '<span class="drift-trend drift-trend--down" title="PSI trending down in the last windows">↓ recovering</span>';
        case 'stable': return '<span class="drift-trend drift-trend--flat" title="PSI is roughly stable across the last windows">→ stable</span>';
        case 'insufficient':
        default:
            return '<span class="drift-trend drift-trend--flat" title="Not enough windows to compute a trend">· insufficient</span>';
    }
}

function buildTraceRows(
    responsesByColumn: Map<string, DriftResponse>,
    _investigation: DriftInvestigationResponse | null,
): TraceReportRow[] {
    return Array.from(responsesByColumn.values()).map((response) => {
        const summary = buildColumnSummary(response);
        const firstChange = response.windows.find((window) => window.drift_level !== 'green') ?? null;
        const latest = response.windows[response.windows.length - 1] ?? strongestWindow(response);
        return {
            column: response.column,
            level: summary.worstLevel,
            drifting: summary.flaggedWindows > 0,
            flaggedWindows: summary.flaggedWindows,
            totalWindows: summary.totalWindows,
            driftScore: latest?.psi ?? 0,
            firstChangeMs: firstChange?.start_ms ?? null,
            evidence: buildEvidenceLabel(latest),
            trend: buildTrend(response),
            latestWasserstein: latest?.wasserstein ?? null,
            latestKsPvalue: latest?.ks_pvalue ?? null,
            latestCompletenessDelta: latest?.completeness_delta ?? null,
            lowSampleWarning: latest?.low_sample_warning ?? false,
            sampleRatioWarning: response.metadata?.psi_sample_ratio_warning ?? false,
        };
    }).sort((left, right) => {
        if (left.drifting !== right.drifting) return left.drifting ? -1 : 1;
        return 0;
    });
}

function buildDatasetWindowCoverage(responsesByColumn: Map<string, DriftResponse>): {
    affected: number;
    total: number;
    firstChangeMs: number | null;
} {
    const responses = Array.from(responsesByColumn.values());
    const total = Math.max(0, ...responses.map((response) => response.windows.length));
    let affected = 0;
    let firstChangeMs: number | null = null;
    for (let index = 0; index < total; index += 1) {
        const flagged = responses
            .map((response) => response.windows[index])
            .filter((window): window is DriftWindowStats => !!window && window.drift_level !== 'green');
        if (flagged.length === 0) continue;
        affected += 1;
        const earliest = Math.min(...flagged.map((window) => window.start_ms));
        firstChangeMs = firstChangeMs === null ? earliest : Math.min(firstChangeMs, earliest);
    }
    return { affected, total, firstChangeMs };
}

function severityLabel(level: DriftWindowStats['drift_level']): string {
    if (level === 'red') return 'Severe';
    if (level === 'yellow') return 'Warning';
    return 'Stable';
}

export function buildDriftSummaryPanelHtml(
    responsesByColumn: Map<string, DriftResponse>,
    investigation: DriftInvestigationResponse | null = null,
    activeColumn: string | null = null,
): DriftSummaryPanelHtml {
    if (responsesByColumn.size === 0) return { summaryStrip: '', columnSummary: '' };

    const globalSummary = buildGlobalSummary(responsesByColumn);
    const rows = buildTraceRows(responsesByColumn, investigation);
    const driftingCount = rows.filter((row) => row.drifting).length;
    const stableCount = rows.length - driftingCount;
    const coverage = buildDatasetWindowCoverage(responsesByColumn);
    const allWindowsAffected = coverage.total > 0 && coverage.affected === coverage.total;
    const degradedColumns = Array.from(responsesByColumn.values())
        .filter((response) => response.metadata?.psi_sample_ratio_warning);
    const isDegraded = degradedColumns.length > 0;
    const verdictClass = isDegraded
        ? ' drift-verdict--degraded'
        : globalSummary.anyDrift ? '' : ' drift-verdict--stable';
    const verdictMarker = isDegraded ? '?' : globalSummary.anyDrift ? '!' : 'OK';
    const verdictTitle = isDegraded
        ? 'Method reliability warning'
        : globalSummary.anyDrift ? 'Data drift detected' : 'No data drift detected';
    const qualityCopy = isDegraded
        ? `Reference is much larger than the evaluation window (≥ 10×). PSI and KS may be unreliable — try a longer window or a shorter reference before drawing conclusions.`
        : allWindowsAffected
            ? 'Every evaluation window is flagged — review baseline and thresholds.'
            : 'Analysis quality checks passed for the selected baseline and thresholds.';

    const degradedBadge = isDegraded
        ? `<span class="drift-verdict__severity drift-amber">Reliability</span>`
        : `<span class="drift-verdict__severity drift-${globalSummary.worstSeverity}">${severityLabel(globalSummary.worstSeverity)}</span>`;

    const strongestEvidence = rows
        .filter((row) => row.drifting)
        .slice(0, 2)
        .map((row) => `<li><strong>${escapeHtml(row.column)}</strong> ${escapeHtml(row.evidence)} on ${row.flaggedWindows} of ${row.totalWindows} windows</li>`)
        .join('');

    const changePoints = (investigation?.rankings?.changePoints ?? []).slice(0, 5);
    const changePointsCard = changePoints.length > 0
        ? `<div class="drift-verdict__change-points">
                <strong>Change points:</strong>
                ${changePoints.map((cp) => `<span class="drift-change-point-chip">${escapeHtml(cp.column)} · ${escapeHtml(cp.isoTime)}</span>`).join('')}
            </div>`
        : '';

    const summaryStrip = `
        <section class="drift-verdict${verdictClass}" aria-label="Dataset drift verdict">
            <div class="drift-verdict__headline">
                <span class="drift-verdict__indicator" aria-hidden="true">${verdictMarker}</span>
                <strong class="drift-verdict__title">${verdictTitle}</strong>
                ${degradedBadge}
            </div>
            <div class="drift-verdict__metric"><strong>${driftingCount} of ${rows.length}</strong><span>traces drifting</span></div>
            <div class="drift-verdict__metric"><strong>${stableCount}</strong><span>stable</span></div>
            <div class="drift-verdict__metric"><strong>${coverage.affected} of ${coverage.total}</strong><span>time windows affected</span></div>
            <div class="drift-verdict__metric"><strong>${formatReportDate(coverage.firstChangeMs)}</strong><span>first detected</span></div>
            <div class="drift-verdict__quality">
                <span class="drift-verdict__quality-marker" aria-hidden="true">!</span>
                <span>${qualityCopy}</span>
                <button type="button" class="drift-verdict__quality-action" data-drift-jump-tab="quality">Open Quality panel</button>
            </div>
            ${changePointsCard}
            <details class="drift-verdict__evidence">
                <summary>Why this verdict?</summary>
                <ul class="drift-verdict__evidence-list">${strongestEvidence || '<li>No evidence captured yet.</li>'}</ul>
            </details>
        </section>
    `;

    const traceRows = rows.map((row) => {
        const persistence = row.totalWindows > 0 ? Math.round((row.flaggedWindows / row.totalWindows) * 100) : 0;
        const statusLabel = row.level === 'red' ? 'Drifting' : row.level === 'yellow' ? 'Warning' : 'Stable';
        const selected = row.column === activeColumn ? ' selected' : '';
        const reliabilityBadge = row.sampleRatioWarning
            ? '<span class="drift-trend-badge drift-trend-badge--warn" title="Reference ≥ 10× window — PSI/KS may be inflated">⚠ PSI</span>'
            : '';
        const wassersteinCell = row.latestWasserstein === null
            ? '—'
            : `${row.latestWasserstein.toFixed(2)}`;
        const ksPvalueCell = row.latestKsPvalue === null
            ? '—'
            : `${row.latestKsPvalue.toFixed(3)}`;
        return `
            <tr class="drift-trace-row${selected}" data-drift-column="${escapeHtml(row.column)}" data-drift-state="${row.drifting ? 'drifting' : 'stable'}" tabindex="0" aria-selected="${row.column === activeColumn ? 'true' : 'false'}">
                <td class="drift-trace-name">${escapeHtml(row.column)}${reliabilityBadge}</td>
                <td><span class="drift-status-chip drift-status-chip--${row.level}">${statusLabel}</span></td>
                <td>${persistence}% (${row.flaggedWindows}/${row.totalWindows})</td>
                <td>${row.driftScore.toFixed(2)}</td>
                <td>${trendBadge(row.trend)}</td>
                <td>${wassersteinCell}</td>
                <td>${ksPvalueCell}</td>
                <td>${formatReportDate(row.firstChangeMs)}</td>
                <td>${escapeHtml(row.evidence)}</td>
                <td><span class="drift-table-action">View evidence</span></td>
            </tr>
        `;
    }).join('');

    const columnSummary = `
        <table class="drift-trace-table">
            <thead><tr><th>Trace</th><th>Status</th><th>Persistence</th><th>PSI</th><th>Trend</th><th>Wasserstein</th><th>KS p</th><th>First change</th><th>Strongest evidence</th><th></th></tr></thead>
            <tbody>${traceRows}</tbody>
        </table>
        <div class="drift-table-empty" hidden>No traces match this filter.</div>
    `;

    return { summaryStrip, columnSummary };
}
