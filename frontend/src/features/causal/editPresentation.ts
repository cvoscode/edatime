import type { EdgeEditDraft } from './editDraft.js';
import type { PairEdgeGroup } from './selectionState.js';

export function renderEdgeDraftHtml(input: {
    group: Pick<PairEdgeGroup, 'nodeA' | 'nodeB' | 'direction' | 'hasUndirected' | 'hasAmbiguous' | 'lags' | 'connections' | 'minPValue'>;
    draft: EdgeEditDraft;
}): string {
    const { group, draft } = input;
    const attrRows = draft.attrs.length > 0
        ? draft.attrs.map((entry) => `
            <div class="causal-inline-editor" data-attr-row data-id="${entry.draftId}">
                <input class="modal-input" data-role="attr-key" type="text" placeholder="Key" value="${escapeHtml(entry.key)}">
                <input class="modal-input" data-role="attr-value" type="text" placeholder="Value" value="${escapeHtml(entry.value)}">
                <button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-attr="${entry.draftId}">Remove</button>
            </div>`).join('')
        : '<div class="causal-empty-note">No edge attributes yet.</div>';
    const connectionRows = draft.connections.length > 0
        ? draft.connections.map((link) => renderConnectionRow(link, group.nodeA, group.nodeB)).join('')
        : '<div class="causal-empty-note">No raw connections yet.</div>';
    return `
        <section class="causal-edit-hero causal-edit-hero-edge">
            <div class="causal-edit-kicker">Pair edge</div>
            <div class="causal-edit-name">${escapeHtml(group.nodeA)} <span class="causal-edit-arrow">${escapeHtml(edgeDirectionGlyph(group))}</span> ${escapeHtml(group.nodeB)}</div>
            <div class="causal-pill-row">
                <span class="causal-pill" title="Overall direction summary for this pair edge after grouping all lag-specific links together.">${escapeHtml(edgeSummaryType(group))}</span>
                <span class="causal-pill" title="Lag values included in this pair edge.">τ ${escapeHtml(compactLagSummary(group))}</span>
                <span class="causal-pill" title="Number of raw lag-specific links collapsed into this one visual pair edge.">${group.connections.length} links</span>
                <span class="causal-pill" title="Smallest p-value observed among the raw links in this pair edge.">pmin ${Number.isFinite(group.minPValue) ? group.minPValue.toFixed(4) : 'n/a'}</span>
            </div>
        </section>
        <section class="causal-edit-section">
            <div class="causal-edit-section-head"><span>Connections</span><button class="btn btn-ghost btn-sm causal-inline-add" type="button" data-add-conn>Add connection</button></div>
            <div class="causal-connection-list">${connectionRows}</div>
            <div class="causal-field-hint">Edit lag-specific links directly here.</div>
        </section>
        <section class="causal-edit-section">
            <div class="causal-edit-section-head"><span>Edge attributes</span><button class="btn btn-ghost btn-sm causal-inline-add" type="button" data-add-attr>Add attribute</button></div>
            <div class="causal-inline-editor-list">${attrRows}</div>
            <div class="causal-field-hint">Attribute values are saved as strings, numbers, booleans, null, or JSON.</div>
        </section>`;
}

function renderConnectionRow(link: EdgeEditDraft['connections'][number], nodeA: string, nodeB: string): string {
    const options = (values: string[], selected: string) => values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
    const direction = `${link.source} → ${link.target}`;
    return `
        <div class="causal-connection-editor" data-conn-row data-id="${link.draftId}">
            <div class="causal-connection-editor-head"><div class="causal-connection-title">${escapeHtml(direction)}</div><button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-conn="${link.draftId}">Remove</button></div>
            <div class="causal-connection-grid">
                <label class="causal-field-stack"><span>From</span><select class="modal-select" data-role="source">${options([nodeA, nodeB], link.source)}</select></label>
                <label class="causal-field-stack"><span>To</span><select class="modal-select" data-role="target">${options([nodeA, nodeB], link.target)}</select></label>
                <label class="causal-field-stack"><span>Lag</span><input class="modal-input" data-role="lag" type="number" min="0" step="1" value="${Number.isFinite(link.lag) ? link.lag : 0}"></label>
                <label class="causal-field-stack"><span>Type</span><select class="modal-select" data-role="type">${options(['-->', 'o->', '<--', '<-o', 'o-o', 'x-x', '-?>'], link.type)}</select></label>
                <label class="causal-field-stack"><span>Value</span><input class="modal-input${Number(link.value) >= 0 ? ' causal-inline-good' : ' causal-inline-bad'}" data-role="value" type="number" step="0.001" value="${Number.isFinite(link.value) ? link.value : 0}"></label>
                <label class="causal-field-stack"><span>P-value</span><input class="modal-input" data-role="pvalue" type="number" min="0" step="0.0001" value="${Number.isFinite(link.pvalue) ? link.pvalue : 0}"></label>
            </div>
        </div>`;
}

function escapeHtml(value: unknown): string { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function edgeDirectionGlyph(group: Pick<PairEdgeGroup, 'direction' | 'hasUndirected' | 'hasAmbiguous'>): string { return group.hasUndirected ? '↔' : group.hasAmbiguous ? '?' : group.direction === 'a_to_b' ? '→' : group.direction === 'b_to_a' ? '←' : '↔'; }
function compactLagSummary(group: Pick<PairEdgeGroup, 'lags'>): string { return group.lags.length === 0 ? 'none' : group.lags.length <= 4 ? group.lags.join(', ') : `${group.lags[0]}-${group.lags[group.lags.length - 1]}`; }
function edgeSummaryType(group: Pick<PairEdgeGroup, 'nodeA' | 'nodeB' | 'direction' | 'hasUndirected' | 'hasAmbiguous'>): string { return group.hasUndirected ? 'undirected/latent' : group.hasAmbiguous ? 'uncertain' : group.direction === 'a_to_b' ? `${group.nodeA} -> ${group.nodeB}` : group.direction === 'b_to_a' ? `${group.nodeB} -> ${group.nodeA}` : 'mixed directions'; }
