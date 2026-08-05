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
    const verdictClass = globalSummary.anyDrift ? '' : ' drift-verdict--stable';
    const verdictMarker = globalSummary.anyDrift ? '!' : 'OK';
    const verdictTitle = globalSummary.anyDrift ? 'Data drift detected' : 'No data drift detected';
    const qualityCopy = allWindowsAffected
        ? 'Every evaluation window is flagged — review baseline and thresholds.'
        : 'Analysis quality checks passed for the selected baseline and thresholds.';

    const summaryStrip = `
        <section class="drift-verdict${verdictClass}" aria-label="Dataset drift verdict">
            <div class="drift-verdict__headline">
                <span class="drift-verdict__indicator" aria-hidden="true">${verdictMarker}</span>
                <strong class="drift-verdict__title">${verdictTitle}</strong>
                <span class="drift-verdict__severity drift-${globalSummary.worstSeverity}">${severityLabel(globalSummary.worstSeverity)}</span>
            </div>
            <div class="drift-verdict__metric"><strong>${driftingCount} of ${rows.length}</strong><span>traces drifting</span></div>
            <div class="drift-verdict__metric"><strong>${stableCount}</strong><span>stable</span></div>
            <div class="drift-verdict__metric"><strong>${coverage.affected} of ${coverage.total}</strong><span>time windows affected</span></div>
            <div class="drift-verdict__metric"><strong>${formatReportDate(coverage.firstChangeMs)}</strong><span>first detected</span></div>
            <div class="drift-verdict__quality">
                <span class="drift-verdict__quality-marker" aria-hidden="true">!</span>
                <span>${qualityCopy}</span>
            </div>
        </section>
    `;

    const traceRows = rows.map((row) => {
        const persistence = row.totalWindows > 0 ? Math.round((row.flaggedWindows / row.totalWindows) * 100) : 0;
        const statusLabel = row.level === 'red' ? 'Drifting' : row.level === 'yellow' ? 'Warning' : 'Stable';
        const selected = row.column === activeColumn ? ' selected' : '';
        return `
            <tr class="drift-trace-row${selected}" data-drift-column="${escapeHtml(row.column)}" data-drift-state="${row.drifting ? 'drifting' : 'stable'}" tabindex="0" aria-selected="${row.column === activeColumn ? 'true' : 'false'}">
                <td class="drift-trace-name">${escapeHtml(row.column)}</td>
                <td><span class="drift-status-chip drift-status-chip--${row.level}">${statusLabel}</span></td>
                <td>${persistence}% (${row.flaggedWindows}/${row.totalWindows})</td>
                <td>${row.driftScore.toFixed(2)}</td>
                <td>${formatReportDate(row.firstChangeMs)}</td>
                <td>${escapeHtml(row.evidence)}</td>
                <td><span class="drift-table-action">View evidence</span></td>
            </tr>
        `;
    }).join('');

    const columnSummary = `
        <table class="drift-trace-table">
            <thead><tr><th>Trace</th><th>Status</th><th>Persistence</th><th>Drift score</th><th>First change</th><th>Strongest evidence</th><th></th></tr></thead>
            <tbody>${traceRows}</tbody>
        </table>
        <div class="drift-table-empty" hidden>No traces match this filter.</div>
    `;

    return { summaryStrip, columnSummary };
}
