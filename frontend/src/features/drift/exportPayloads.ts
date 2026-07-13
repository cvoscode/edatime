import { buildColumnSummary, type DriftEvaluationMode, type DriftInvestigationResponse, type DriftResponse } from './viewModels.js';

export function buildDriftCsv(responsesByColumn: Map<string, DriftResponse>): string {
    const rows: string[] = [
        'column,window,start_ms,end_ms,count,mean,std,median,ks_stat,ks_pvalue,es_stat,es_pvalue,wasserstein,psi,jensen_shannon,completeness_delta,trigger_reasons,drift_level,current_level,worst_level,flagged_windows',
    ];
    responsesByColumn.forEach((response, column) => {
        const summary = buildColumnSummary(response);
        response.windows.forEach((window) => {
            rows.push([
                column,
                window.label,
                window.start_ms,
                window.end_ms,
                window.count,
                Number.isFinite(window.mean) ? window.mean.toFixed(6) : '',
                Number.isFinite(window.std) ? window.std.toFixed(6) : '',
                Number.isFinite(window.quantiles[2]) ? window.quantiles[2].toFixed(6) : '',
                window.ks_stat.toFixed(6),
                window.ks_pvalue.toFixed(6),
                Number.isFinite(window.es_stat) ? window.es_stat.toFixed(6) : '',
                Number.isFinite(window.es_pvalue) ? window.es_pvalue.toFixed(6) : '',
                window.wasserstein.toFixed(6),
                window.psi.toFixed(6),
                Number.isFinite(window.jensen_shannon) ? window.jensen_shannon.toFixed(6) : '',
                Number.isFinite(window.completeness_delta) ? window.completeness_delta.toFixed(6) : '',
                `"${(window.trigger_reasons || []).join('|')}"`,
                window.drift_level,
                summary.currentLevel,
                summary.worstLevel,
                summary.flaggedWindows,
            ].join(','));
        });
    });
    return rows.join('\n');
}

export function buildDriftJsonExport(
    investigation: DriftInvestigationResponse,
    activeColumn: string | null,
    evaluationMode: DriftEvaluationMode,
    latestWindowCount: number,
    filteredResponses: Map<string, DriftResponse>,
): string {
    return JSON.stringify({
        ...investigation,
        activeColumn,
        evaluationMode,
        latestWindowCount,
        filteredColumns: Object.fromEntries(filteredResponses.entries()),
    }, null, 2);
}
