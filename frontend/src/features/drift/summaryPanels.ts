import { buildColumnSummary, buildGlobalSummary, formatValue, type DriftResponse } from './viewModels.js';

export interface DriftSummaryPanelHtml {
    summaryStrip: string;
    columnSummary: string;
}

export function buildDriftSummaryPanelHtml(
    responsesByColumn: Map<string, DriftResponse>,
): DriftSummaryPanelHtml {
    if (responsesByColumn.size === 0) return { summaryStrip: '', columnSummary: '' };

    const globalSummary = buildGlobalSummary(responsesByColumn);
    const summaryStrip = `
        <div class="drift-summary-card">
            <span class="drift-summary-label">Any drift detected?</span>
            <strong class="drift-summary-value">${globalSummary.anyDrift ? 'Yes' : 'No'}</strong>
        </div>
        <div class="drift-summary-card">
            <span class="drift-summary-label">Columns flagged</span>
            <strong class="drift-summary-value">${globalSummary.columnsFlagged}/${globalSummary.totalColumns}</strong>
        </div>
        <div class="drift-summary-card">
            <span class="drift-summary-label">Latest window severity</span>
            <strong class="drift-summary-value drift-${globalSummary.latestSeverity}">${globalSummary.latestSeverity.toUpperCase()}</strong>
        </div>
        <div class="drift-summary-card">
            <span class="drift-summary-label">Worst window severity</span>
            <strong class="drift-summary-value drift-${globalSummary.worstSeverity}">${globalSummary.worstSeverity.toUpperCase()}</strong>
        </div>
    `;
    const columnSummary = Array.from(responsesByColumn.values()).map((response) => {
        const summary = buildColumnSummary(response);
        return `
            <article class="drift-column-card">
                <div class="drift-column-card__header">
                    <strong>${summary.column}</strong>
                    <span class="drift-column-card__level drift-${summary.currentLevel}">${summary.currentLevel.toUpperCase()}</span>
                </div>
                <div class="drift-column-card__body">
                    <div>Window: ${summary.latestLabel}</div>
                    <div>Strongest reasons: ${summary.strongestReasons.join(', ') || 'none'}</div>
                    <div>Latest PSI/Wass: ${summary.latestMetrics.psi.toFixed(3)} / ${formatValue(summary.latestMetrics.wasserstein)}</div>
                    <div>Latest KS p / E-S p: ${summary.latestMetrics.ksPvalue.toFixed(3)} / ${summary.latestMetrics.esPvalue.toFixed(3)}</div>
                    <div>Flagged windows: ${summary.flaggedWindows}/${summary.totalWindows}</div>
                </div>
            </article>
        `;
    }).join('');

    return { summaryStrip, columnSummary };
}
