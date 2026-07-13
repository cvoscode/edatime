import type {
    DriftChangePointRank,
    DriftFeatureRank,
    DriftInvestigationResponse,
    DriftQualityIssueRank,
    DriftRelationshipRank,
} from './viewModels.js';

export interface DriftInvestigationPanelHtml {
    overview: string;
    segments: string;
    quality: string;
    relationships: string;
}

function renderFeatureRankCards(ranks: DriftFeatureRank[]): string {
    return ranks.slice(0, 5).map((rank) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header">
                <strong>${rank.column}</strong>
                <span class="drift-column-card__level drift-${rank.latestLevel}">${rank.latestLevel.toUpperCase()}</span>
            </div>
            <div class="drift-column-card__body">
                <div>Score: ${rank.driftScore}</div>
                <div>Flagged windows: ${rank.flaggedWindows}</div>
                <div>First change: ${rank.firstChangePoint || 'None'}</div>
            </div>
        </article>
    `).join('');
}

function renderSimpleList<T>(items: T[], renderItem: (item: T) => string, emptyText: string): string {
    if (items.length === 0) return `<div class="drift-column-card"><div class="drift-column-card__body">${emptyText}</div></div>`;
    return items.slice(0, 5).map(renderItem).join('');
}

export function buildDriftInvestigationPanelHtml(
    investigation: DriftInvestigationResponse | null,
    usingLegacyFallback: boolean,
): DriftInvestigationPanelHtml {
    if (!investigation) {
        return { overview: '', segments: '', quality: '', relationships: '' };
    }

    const overview = `
        <div class="drift-summary-strip">
            ${usingLegacyFallback ? `
            <div class="drift-summary-card">
                <span class="drift-summary-label">Legacy fallback</span>
                <strong class="drift-summary-value">Using /api/drift/stats compatibility mode</strong>
            </div>
            ` : ''}
            <div class="drift-summary-card">
                <span class="drift-summary-label">Investigation score</span>
                <strong class="drift-summary-value">${investigation.overview.driftScore}</strong>
            </div>
            <div class="drift-summary-card">
                <span class="drift-summary-label">Worst level</span>
                <strong class="drift-summary-value drift-${investigation.overview.worstLevel}">${investigation.overview.worstLevel.toUpperCase()}</strong>
            </div>
            <div class="drift-summary-card">
                <span class="drift-summary-label">First change point</span>
                <strong class="drift-summary-value">${investigation.overview.firstChangePoint || 'None'}</strong>
            </div>
        </div>
        <div class="drift-column-summary">
            ${renderFeatureRankCards(investigation.rankings.features)}
            ${renderSimpleList<DriftChangePointRank>(investigation.rankings.changePoints, (item) => `
                <article class="drift-column-card">
                    <div class="drift-column-card__header"><strong>${item.column}</strong><span>${item.label}</span></div>
                    <div class="drift-column-card__body"><div>Change point: ${item.isoTime}</div><div>Reasons: ${item.triggerReasons.join(', ') || 'none'}</div></div>
                </article>
            `, 'No change points detected.')}
        </div>
    `;

    const segments = renderSimpleList(investigation.segments?.groups ?? [], (group) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header"><strong>${group.value}</strong><span>${group.sampleCount} rows</span></div>
            <div class="drift-column-card__body"><div>Score: ${group.overview.driftScore}</div><div>Flagged columns: ${group.overview.columnsFlagged}</div></div>
        </article>
    `, 'No segment breakdown returned.');

    const quality = renderSimpleList<DriftQualityIssueRank>(investigation.rankings.qualityIssues, (issue) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header"><strong>${issue.column}</strong><span>${issue.driftScore}</span></div>
            <div class="drift-column-card__body"><div>${issue.label}</div><div>Issue key: ${issue.issue}</div></div>
        </article>
    `, 'No quality issues detected.');

    const pairs = investigation.relationships?.pairs ?? investigation.rankings.relationships;
    const relationships = renderSimpleList<DriftRelationshipRank>(pairs, (pair) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header"><strong>${pair.leftColumn} ↔ ${pair.rightColumn}</strong><span>${pair.delta.toFixed(3)}</span></div>
            <div class="drift-column-card__body"><div>Reference: ${pair.reference.toFixed(3)}</div><div>Comparison: ${pair.comparison.toFixed(3)}</div></div>
        </article>
    `, 'No relationship drift detected.');

    return { overview, segments, quality, relationships };
}
