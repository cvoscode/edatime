/**
 * causal/editPanel — node and pair-edge edit UI.
 * Owns the edit modal, context menu, and all edit-related DOM interactions.
 */
import type { CausalLink } from './causalComparison.js';
import {
    _chipColors,
    _nodeLabels,
    _nodeAttrs,
    _pairAttrs,
    _currentColumns,
    _currentLinks,
    _nodePositions,
    _selectedColumns,
    setCurrentColumns,
    setCurrentLinks,
    clearPairAttrsKey,
    setPairAttrsKey,
    deletePairAttrsKeys,
    buildPairGroupFromConnections,
    getPairGroup,
    listPairGroups,
    pairKey,
    resolveLinkDirection,
    type PairEdgeGroup,
} from './selectionState.js';
import { getDropdownValueFromElement, upgradeSelects } from '../../ui/primitives/Dropdown.js';
import { upgradeFlexibleNumberInputs } from '../../ui/primitives/FlexibleNumberInput.js';
import { setStatus } from './statusView.js';
import { validatePairEdgeDraft } from './editPolicy.js';
import {
    appendDraftConnection,
    createPairEdgeDraft,
    removeDraftAttribute,
    removeDraftConnection,
    type EdgeEditDraft,
} from './editDraft.js';

export type EditTarget = { kind: 'node'; col: string } | { kind: 'edge'; key: string };

let _editTarget: EditTarget | null = null;
let _edgeEditDraft: EdgeEditDraft | null = null;
let _draftSeq = 0;

export function getEditTarget(): EditTarget | null {
    return _editTarget;
}

export function setEditTarget(t: EditTarget | null): void {
    _editTarget = t;
}

export function nextDraftId(prefix: string): string {
    _draftSeq += 1;
    return `${prefix}-${_draftSeq}`;
}

function escH(value: string): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function attrsToJson(value: Record<string, unknown> | undefined): string {
    return JSON.stringify(value ?? {}, null, 2);
}

function parseLooseValue(raw: string): unknown {
    const text = raw.trim();
    if (!text) return '';
    if (/^(true|false|null)$/i.test(text)) return JSON.parse(text.toLowerCase());
    if (/^-?\d+(\.\d+)?$/.test(text)) { const n = Number(text); if (Number.isFinite(n)) return n; }
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('"') && text.endsWith('"'))) {
        try { return JSON.parse(text); } catch { /* fall through */ }
    }
    return raw;
}

function edgeTypeOptions(): string[] {
    return ['-->', 'o->', '<--', '<-o', 'o-o', 'x-x', '-?>'];
}

function edgeDirectionGlyph(group: PairEdgeGroup): string {
    if (group.hasUndirected) return '↔';
    if (group.hasAmbiguous) return '?';
    if (group.direction === 'a_to_b') return '→';
    if (group.direction === 'b_to_a') return '←';
    return '↔';
}

function compactLagSummary(group: PairEdgeGroup): string {
    if (group.lags.length === 0) return 'none';
    if (group.lags.length <= 4) return group.lags.join(', ');
    return `${group.lags[0]}-${group.lags[group.lags.length - 1]}`;
}

function edgeMetricTip(kind: 'summary' | 'tau' | 'raw' | 'pmin' | 'type' | 'value' | 'pvalue'): string {
    switch (kind) {
        case 'summary': return 'Overall direction summary for this pair edge after grouping all lag-specific links together.';
        case 'tau': return 'Lag values included in this pair edge. tau=1 means one time step of delay, tau=2 means two steps, and so on.';
        case 'raw': return 'Number of raw lag-specific links collapsed into this one visual pair edge.';
        case 'pmin': return 'Smallest p-value observed among the raw links in this pair edge.';
        case 'type': return 'Raw Tigramite edge mark for this single lag-specific connection.';
        case 'value': return 'Effect strength/statistic for this raw connection. Positive and negative values indicate opposite directions of effect.';
        case 'pvalue': return 'P-value for this raw connection. Lower values indicate stronger evidence against the null.';
        default: return '';
    }
}

function edgeSummaryType(group: PairEdgeGroup): string {
    if (group.hasUndirected) return 'undirected/latent';
    if (group.hasAmbiguous) return 'uncertain';
    if (group.direction === 'a_to_b') return `${group.nodeA} -> ${group.nodeB}`;
    if (group.direction === 'b_to_a') return `${group.nodeB} -> ${group.nodeA}`;
    return 'mixed directions';
}

function draftGroup(): PairEdgeGroup | null {
    if (!_edgeEditDraft) return null;
    return buildPairGroupFromConnections(
        _edgeEditDraft.key,
        _edgeEditDraft.nodeA,
        _edgeEditDraft.nodeB,
        _edgeEditDraft.connections.map(({ draftId: _id, ...link }) => link),
    );
}

function syncEdgeDraftFromDom(): void {
    if (!_edgeEditDraft) return;
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl) return;

    _edgeEditDraft.attrs = Array.from(bodyEl.querySelectorAll<HTMLElement>('[data-attr-row]')).map((row) => {
        const keyInput = row.querySelector<HTMLInputElement>('[data-role="attr-key"]');
        const valueInput = row.querySelector<HTMLInputElement>('[data-role="attr-value"]');
        return { draftId: row.dataset.id || nextDraftId('attr'), key: keyInput?.value ?? '', value: valueInput?.value ?? '' };
    });

    _edgeEditDraft.connections = Array.from(bodyEl.querySelectorAll<HTMLElement>('[data-conn-row]')).map((row) => {
        const sourceInput = row.querySelector<HTMLElement>('[data-role="source"]');
        const targetInput = row.querySelector<HTMLElement>('[data-role="target"]');
        const lagInput = row.querySelector<HTMLInputElement>('[data-role="lag"]');
        const typeInput = row.querySelector<HTMLElement>('[data-role="type"]');
        const valueInput = row.querySelector<HTMLInputElement>('[data-role="value"]');
        const pvalueInput = row.querySelector<HTMLInputElement>('[data-role="pvalue"]');
        return {
            draftId: row.dataset.id || nextDraftId('conn'),
            source: getDropdownValueFromElement(sourceInput) || _edgeEditDraft!.nodeA,
            target: getDropdownValueFromElement(targetInput) || _edgeEditDraft!.nodeB,
            lag: Number(lagInput?.value ?? 0),
            type: getDropdownValueFromElement(typeInput) || '-->',
            value: Number(valueInput?.value ?? 0),
            pvalue: Number(pvalueInput?.value ?? 0),
        };
    });
}

function bindEdgeDraftControls(): void {
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl || !_edgeEditDraft) return;

    bodyEl.querySelectorAll<HTMLElement>('[data-remove-attr]').forEach((button) => {
        button.onclick = () => {
            syncEdgeDraftFromDom();
            if (!_edgeEditDraft) return;
            removeDraftAttribute(_edgeEditDraft, button.dataset.removeAttr || '');
            renderEdgeDraftEditor();
        };
    });

    bodyEl.querySelectorAll<HTMLElement>('[data-remove-conn]').forEach((button) => {
        button.onclick = () => {
            syncEdgeDraftFromDom();
            if (!_edgeEditDraft) return;
            removeDraftConnection(_edgeEditDraft, button.dataset.removeConn || '');
            renderEdgeDraftEditor();
        };
    });

    bodyEl.querySelector<HTMLElement>('[data-add-attr]')?.addEventListener('click', () => {
        syncEdgeDraftFromDom();
        if (!_edgeEditDraft) return;
        _edgeEditDraft.attrs.push({ draftId: nextDraftId('attr'), key: '', value: '' });
        renderEdgeDraftEditor();
    });

    bodyEl.querySelector<HTMLElement>('[data-add-conn]')?.addEventListener('click', () => {
        syncEdgeDraftFromDom();
        if (!_edgeEditDraft) return;
        appendDraftConnection(_edgeEditDraft, nextDraftId);
        renderEdgeDraftEditor();
    });
}

function renderEdgeDraftEditor(): void {
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!bodyEl || !_edgeEditDraft) return;
    const group = draftGroup();
    if (!group) return;

    const attrRows = _edgeEditDraft.attrs.length > 0
        ? _edgeEditDraft.attrs.map((entry) => `
            <div class="causal-inline-editor" data-attr-row data-id="${entry.draftId}">
                <input class="modal-input" data-role="attr-key" type="text" placeholder="Key" value="${escH(entry.key)}">
                <input class="modal-input" data-role="attr-value" type="text" placeholder="Value" value="${escH(entry.value)}">
                <button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-attr="${entry.draftId}">Remove</button>
            </div>`).join('')
        : '<div class="causal-empty-note">No edge attributes yet.</div>';

    const connectionRows = _edgeEditDraft.connections.length > 0
        ? _edgeEditDraft.connections.map((link) => {
            const direction = `${link.source} → ${link.target}`;
            const typeOptions = edgeTypeOptions().map((t) => `<option value="${t}"${link.type === t ? ' selected' : ''}>${t}</option>`).join('');
            const sourceOptions = [group.nodeA, group.nodeB].map((n) => `<option value="${n}"${link.source === n ? ' selected' : ''}>${n}</option>`).join('');
            const targetOptions = [group.nodeA, group.nodeB].map((n) => `<option value="${n}"${link.target === n ? ' selected' : ''}>${n}</option>`).join('');
            const valueTone = Number(link.value) >= 0 ? ' causal-inline-good' : ' causal-inline-bad';
            return `
                <div class="causal-connection-editor" data-conn-row data-id="${link.draftId}">
                    <div class="causal-connection-editor-head">
                        <div class="causal-connection-title">${escH(direction)}</div>
                        <button class="btn btn-ghost btn-sm causal-inline-remove" type="button" data-remove-conn="${link.draftId}">Remove</button>
                    </div>
                    <div class="causal-connection-grid">
                        <label class="causal-field-stack"><span>From</span><select class="modal-select" data-role="source">${sourceOptions}</select></label>
                        <label class="causal-field-stack"><span>To</span><select class="modal-select" data-role="target">${targetOptions}</select></label>
                        <label class="causal-field-stack"><span>Lag</span><input class="modal-input" data-role="lag" type="number" min="0" step="1" value="${Number.isFinite(link.lag) ? link.lag : 0}"></label>
                        <label class="causal-field-stack"><span>Type</span><select class="modal-select" data-role="type">${typeOptions}</select></label>
                        <label class="causal-field-stack"><span>Value</span><input class="modal-input${valueTone}" data-role="value" type="number" step="0.001" value="${Number.isFinite(link.value) ? link.value : 0}"></label>
                        <label class="causal-field-stack"><span>P-value</span><input class="modal-input" data-role="pvalue" type="number" min="0" step="0.0001" value="${Number.isFinite(link.pvalue) ? link.pvalue : 0}"></label>
                    </div>
                </div>`;
        }).join('')
        : '<div class="causal-empty-note">No raw connections yet.</div>';

    bodyEl.innerHTML = `
        <section class="causal-edit-hero causal-edit-hero-edge">
            <div class="causal-edit-kicker">Pair edge</div>
            <div class="causal-edit-name">${escH(group.nodeA)} <span class="causal-edit-arrow">${escH(edgeDirectionGlyph(group))}</span> ${escH(group.nodeB)}</div>
            <div class="causal-pill-row">
                <span class="causal-pill" title="${escH(edgeMetricTip('summary'))}">${escH(edgeSummaryType(group))}</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('tau'))}">τ ${escH(compactLagSummary(group))}</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('raw'))}">${group.connections.length} links</span>
                <span class="causal-pill" title="${escH(edgeMetricTip('pmin'))}">pmin ${Number.isFinite(group.minPValue) ? group.minPValue.toFixed(4) : 'n/a'}</span>
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
        </section>
    `;
    upgradeSelects(bodyEl);
    upgradeFlexibleNumberInputs(bodyEl);
    bindEdgeDraftControls();
}

export function openEditPanel(target: EditTarget): void {
    const panel = document.getElementById('causal-edit-panel') as HTMLElement | null;
    const titleEl = document.getElementById('causal-edit-title') as HTMLElement | null;
    const bodyEl = document.getElementById('causal-edit-body') as HTMLElement | null;
    if (!panel || !bodyEl) return;

    _editTarget = target;
    panel.hidden = false;

    if (target.kind === 'node') {
        const col = target.col;
        const label = _nodeLabels.get(col) || col;
        const color = _chipColors.get(col) || '#00a8ff';
        if (titleEl) titleEl.textContent = `Node: ${col}`;
        bodyEl.innerHTML = `
          <label class="causal-field-row">
            <span>Label</span>
            <input type="text" id="ep-node-label" class="modal-input" style="flex:1" value="${escH(label)}">
          </label>
          <label class="causal-field-row">
            <span>Color</span>
            <input type="color" id="ep-node-color" value="${escH(color)}" style="width:36px;height:28px;padding:2px;">
          </label>
          <label class="causal-field-stack">
            <span>Attributes (JSON)</span>
            <textarea id="ep-node-attrs" class="modal-input causal-field-textarea">${escH(attrsToJson(_nodeAttrs.get(col) as unknown as Record<string, unknown> | undefined))}</textarea>
            <span class="causal-field-hint">Store any node metadata here.</span>
          </label>`;
        return;
    }

    const group = getPairGroup(target.key);
    if (!group) { closeEditPanel(); return; }
    _edgeEditDraft = createPairEdgeDraft(
        group,
        (_pairAttrs.get(group.key) ?? {}) as Record<string, unknown>,
        nextDraftId,
    );
    if (titleEl) titleEl.textContent = `Pair Edge: ${group.nodeA} - ${group.nodeB}`;
    renderEdgeDraftEditor();
}

function parseAttrsJson(raw: string, kind: string): Record<string, unknown> | null {
    try {
        const parsed = raw.trim() ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setStatus(`${kind} attributes must be a JSON object.`, 'error');
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        setStatus(`${kind} attributes must be valid JSON.`, 'error');
        return null;
    }
}

function replacePairConnections(oldKey: string, nextConnections: CausalLink[]): void {
    setCurrentLinks(_currentLinks.filter((link) => link.source === link.target || pairKey(link.source, link.target) !== oldKey));
    _currentLinks.push(...nextConnections);
}

export function applyEditPanel(): void {
    if (!_editTarget) return;
    if (_editTarget.kind === 'node') {
        const col = _editTarget.col;
        const labelInput = document.getElementById('ep-node-label') as HTMLInputElement | null;
        const colorInput = document.getElementById('ep-node-color') as HTMLInputElement | null;
        const attrsInput = document.getElementById('ep-node-attrs') as HTMLTextAreaElement | null;
        const attrs = parseAttrsJson(attrsInput?.value || '{}', 'Node');
        if (!attrs) return;
        if (labelInput?.value.trim()) _nodeLabels.set(col, labelInput.value.trim());
        if (colorInput?.value) _chipColors.set(col, colorInput.value);
        _nodeAttrs.set(col, attrs);
        closeEditPanel();
        setStatus(`Node ${col} updated.`, 'success');
        return;
    }

    syncEdgeDraftFromDom();
    if (!_edgeEditDraft) return;

    const attrs: Record<string, unknown> = {};
    for (const entry of _edgeEditDraft.attrs) {
        const key = entry.key.trim();
        if (!key) continue;
        attrs[key] = parseLooseValue(entry.value);
    }

    const validation = validatePairEdgeDraft({
        pairKey: _edgeEditDraft.key,
        columns: _currentColumns,
        connections: _edgeEditDraft.connections,
    });
    if (!validation.ok) {
        setStatus(validation.message, 'error');
        return;
    }

    replacePairConnections(_editTarget.key, validation.connections);
    clearPairAttrsKey(_editTarget.key);
    if (Object.keys(attrs).length > 0) setPairAttrsKey(_edgeEditDraft.key, attrs);
    closeEditPanel();
    setStatus('Pair edge updated.', 'success');
}

export function closeEditPanel(): void {
    const panel = document.getElementById('causal-edit-panel') as HTMLElement | null;
    if (panel) panel.hidden = true;
    _editTarget = null;
    _edgeEditDraft = null;
}

export function deleteTarget(target: EditTarget): void {
    if (target.kind === 'node') {
        const col = target.col;
        setCurrentColumns(_currentColumns.filter((v) => v !== col));
        setCurrentLinks(_currentLinks.filter((link) => link.source !== col && link.target !== col));
        _selectedColumns.delete(col);
        _nodeLabels.delete(col);
        _nodeAttrs.delete(col);
        _nodePositions.delete(col);
        deletePairAttrsKeys((key) => key.startsWith(`${col}||`) || key.endsWith(`||${col}`));
    } else {
        replacePairConnections(target.key, []);
        clearPairAttrsKey(target.key);
    }
    closeEditPanel();
    setStatus(target.kind === 'node' ? `Node ${target.col} deleted.` : 'Pair edge deleted.', 'success');
}

// ─── Context menu ────────────────────────────────────────────────────────────

export function showCtxMenu(x: number, y: number, target: EditTarget): void {
    const ctxMenu = document.getElementById('causal-ctx-menu') as HTMLElement | null;
    if (!ctxMenu) return;
    _editTarget = target;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
    ctxMenu.hidden = false;
}

export function hideCtxMenu(): void {
    const ctxMenu = document.getElementById('causal-ctx-menu') as HTMLElement | null;
    if (ctxMenu) ctxMenu.hidden = true;
}

// ─── Public export for causalPage event wiring ─────────────────────────────

export function bindEditPanelEvents(): void {
    document.getElementById('causal-edit-close')?.addEventListener('click', closeEditPanel);
    document.getElementById('causal-edit-apply')?.addEventListener('click', applyEditPanel);
    document.getElementById('causal-edit-delete')?.addEventListener('click', () => {
        const t = _editTarget;
        if (t) deleteTarget(t);
    });
    document.getElementById('causal-ctx-edit')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) openEditPanel(_editTarget);
        hideCtxMenu();
    });
    document.getElementById('causal-ctx-delete')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) deleteTarget(_editTarget);
        hideCtxMenu();
    });
    document.addEventListener('click', () => { hideCtxMenu(); });
}
