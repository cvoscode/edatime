import type { CausalLink } from './causalComparison.js';

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]!);
}

function numberText(value: number, digits: number): string {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

/** Render the exact lag-specific links currently held by the causal graph. */
export function buildCausalLinksTableHtml(links: readonly CausalLink[]): string {
    if (links.length === 0) return '';
    const rows = links.map((link) => `<tr>
        <th scope="row">${escapeHtml(link.source)}</th>
        <td aria-label="to">→</td>
        <td>${escapeHtml(link.target)}</td>
        <td>${Number.isFinite(link.lag) ? link.lag : '—'}</td>
        <td>${escapeHtml(link.type || '—')}</td>
        <td>${numberText(link.value, 4)}</td>
        <td>${numberText(link.pvalue, 4)}</td>
    </tr>`).join('');
    return `<table class="causal-links-table"><caption>Lag-specific links currently displayed in the causal graph (${links.length.toLocaleString()})</caption><thead><tr><th scope="col">Source</th><th scope="col" aria-label="Direction"></th><th scope="col">Target</th><th scope="col">Lag</th><th scope="col">Type</th><th scope="col">Strength</th><th scope="col">p-value</th></tr></thead><tbody>${rows}</tbody></table>`;
}
