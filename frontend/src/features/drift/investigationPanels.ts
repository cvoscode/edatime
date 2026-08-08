import type {
    DriftChangePointRank,
    DriftFeatureRank,
    DriftInvestigationResponse,
    DriftQualityIssueRank,
    DriftRelationshipRank,
    DriftResponse,
} from './viewModels.js';

export interface DriftInvestigationPanelHtml {
    overview: string;
    segments: string;
    quality: string;
    relationships: string;
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

function renderFeatureRankCards(ranks: DriftFeatureRank[]): string {
    return ranks.slice(0, 5).map((rank) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header">
                <strong>${escapeHtml(rank.column)}</strong>
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

function renderQualityColumnCards(columns: DriftResponse[]): string {
    const flagged = columns.filter((response) => {
        const metadata = response.metadata;
        return metadata?.psi_sample_ratio_warning
            || metadata?.bin_count_warning
            || response.windows.some((window) => window.low_sample_warning);
    });
    if (flagged.length === 0) return '';
    return flagged.slice(0, 5).map((response) => {
        const metadata = response.metadata;
        const sampleSize = metadata?.avg_window_samples ?? 0;
        const referenceSamples = metadata?.reference_samples ?? 0;
        const ratio = sampleSize > 0 ? referenceSamples / sampleSize : 0;
        const warnings: string[] = [];
        if (metadata?.psi_sample_ratio_warning) {
            warnings.push(`Reference is ${ratio.toFixed(0)}× the average window size — PSI/KS may be inflated. Try a longer window or a shorter reference.`);
        }
        if (metadata?.bin_count_warning) {
            warnings.push(`Bin count was reduced to ${metadata?.effective_bins ?? '?'} (reference is degenerate).`);
        }
        const lowSampleWindows = response.windows.filter((window) => window.low_sample_warning).length;
        if (lowSampleWindows > 0) {
            warnings.push(`${lowSampleWindows} window(s) had fewer than 5 samples — drift metrics were zeroed.`);
        }
        return `
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>${escapeHtml(response.column)}</strong><span class="drift-column-card__level drift-amber">${warnings.length} warning${warnings.length === 1 ? '' : 's'}</span></div>
                <div class="drift-column-card__body">
                    ${warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join('')}
                </div>
            </article>
        `;
    }).join('');
}

export function buildDriftInvestigationPanelHtml(
    investigation: DriftInvestigationResponse | null,
): DriftInvestigationPanelHtml {
    if (!investigation) {
        return { overview: '', segments: '', quality: '', relationships: '' };
    }

    const columnResponses = Object.values(investigation.columns ?? {}) as DriftResponse[];
    const numericFormatter = (n: number) => Number.isFinite(n) ? n.toFixed(2) : '—';

    const overview = `
        <div class="drift-investigation-cards">
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>Investigation score</strong></div>
                <div class="drift-column-card__body"><strong class="drift-${investigation.overview.worstLevel}">${numericFormatter(investigation.overview.driftScore)}</strong></div>
            </article>
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>Worst level</strong></div>
                <div class="drift-column-card__body"><span class="drift-column-card__level drift-${investigation.overview.worstLevel}">${investigation.overview.worstLevel.toUpperCase()}</span></div>
            </article>
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>Columns flagged</strong></div>
                <div class="drift-column-card__body">${investigation.overview.columnsFlagged} of ${investigation.overview.totalColumns}</div>
            </article>
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>Windows flagged</strong></div>
                <div class="drift-column-card__body">${investigation.overview.windowsFlagged}</div>
            </article>
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>First change point</strong></div>
                <div class="drift-column-card__body">${investigation.overview.firstChangePoint || 'None'}</div>
            </article>
        </div>
        <h3 class="drift-investigation-subhead">Top features</h3>
        <div class="drift-investigation-grid">
            ${renderFeatureRankCards(investigation.rankings.features)}
        </div>
        <h3 class="drift-investigation-subhead">Change points</h3>
        <div class="drift-investigation-grid">
            ${renderSimpleList<DriftChangePointRank>(investigation.rankings.changePoints, (item) => `
                <article class="drift-column-card">
                    <div class="drift-column-card__header"><strong>${escapeHtml(item.column)}</strong><span>${escapeHtml(item.label)}</span></div>
                    <div class="drift-column-card__body"><div>Change point: ${escapeHtml(item.isoTime)}</div><div>Reasons: ${item.triggerReasons.map((reason) => escapeHtml(reason)).join(', ') || 'none'}</div></div>
                </article>
            `, 'No change points detected.')}
        </div>
    `;

    const segments = renderSimpleList(investigation.segments?.groups ?? [], (group) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header"><strong>${escapeHtml(group.value)}</strong><span>${group.sampleCount} rows</span></div>
            <div class="drift-column-card__body"><div>Score: ${numericFormatter(group.overview.driftScore)}</div><div>Flagged columns: ${group.overview.columnsFlagged}</div></div>
        </article>
    `, 'No segment breakdown returned.');

    const qualityCards = renderQualityColumnCards(columnResponses);
    const qualityItems = renderSimpleList<DriftQualityIssueRank>(investigation.rankings.qualityIssues, (issue) => `
        <article class="drift-column-card">
            <div class="drift-column-card__header"><strong>${escapeHtml(issue.column)}</strong><span>${numericFormatter(issue.driftScore)}</span></div>
            <div class="drift-column-card__body"><div>${escapeHtml(issue.label)}</div><div>Issue key: ${escapeHtml(issue.issue)}</div></div>
        </article>
    `, 'No data-quality issues detected.');

    const quality = `
        <h3 class="drift-investigation-subhead">Method reliability</h3>
        <div class="drift-investigation-grid">
            ${qualityCards || '<div class="drift-column-card"><div class="drift-column-card__body">All metrics ran with adequate sample sizes.</div></div>'}
        </div>
        <h3 class="drift-investigation-subhead">Data-quality issues</h3>
        <div class="drift-investigation-grid">
            ${qualityItems}
        </div>
    `;

    const pairs = investigation.relationships?.pairs ?? investigation.rankings.relationships;
    const relationships = pairs.length === 0
        ? '<div class="drift-column-card"><div class="drift-column-card__body">No relationship drift detected.</div></div>'
        : `<div class="drift-investigation-grid">${pairs.slice(0, 12).map((pair) => `
            <article class="drift-column-card">
                <div class="drift-column-card__header"><strong>${escapeHtml(pair.leftColumn)} ↔ ${escapeHtml(pair.rightColumn)}</strong><span>${numericFormatter(pair.delta)}</span></div>
                <div class="drift-column-card__body"><div>Reference correlation: ${numericFormatter(pair.reference)}</div><div>Comparison correlation: ${numericFormatter(pair.comparison)}</div><div>Aligned samples: ${pair.alignedReferenceSamples} → ${pair.alignedComparisonSamples}</div></div>
            </article>
        `).join('')}</div>`;

    return { overview, segments, quality, relationships };
}
