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
import { renderEdgeDraftHtml } from './editPresentation.js';
import { renderNodeEditHtml } from './nodeEditPresentation.js';

export type EditTarget = { kind: 'node'; col: string } | { kind: 'edge'; key: string };

let _editTarget: EditTarget | null = null;
let _edgeEditDraft: EdgeEditDraft | null = null;
let _draftSeq = 0;
let _disposeEditPanelEvents: (() => void) | null = null;

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

    bodyEl.innerHTML = renderEdgeDraftHtml({ group, draft: _edgeEditDraft });
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
        bodyEl.innerHTML = renderNodeEditHtml({
            label,
            color,
            attributes: (_nodeAttrs.get(col) ?? {}) as Record<string, unknown>,
        });
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

export function bindEditPanelEvents(): () => void {
    _disposeEditPanelEvents?.();
    const controller = new AbortController();
    const listenerOptions = { signal: controller.signal };
    document.getElementById('causal-edit-close')?.addEventListener('click', closeEditPanel, listenerOptions);
    document.getElementById('causal-edit-apply')?.addEventListener('click', applyEditPanel, listenerOptions);
    document.getElementById('causal-edit-delete')?.addEventListener('click', () => {
        const t = _editTarget;
        if (t) deleteTarget(t);
    }, listenerOptions);
    document.getElementById('causal-ctx-edit')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) openEditPanel(_editTarget);
        hideCtxMenu();
    }, listenerOptions);
    document.getElementById('causal-ctx-delete')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (_editTarget) deleteTarget(_editTarget);
        hideCtxMenu();
    }, listenerOptions);
    document.addEventListener('click', hideCtxMenu, listenerOptions);
    const dispose = () => {
        controller.abort();
        if (_disposeEditPanelEvents === dispose) _disposeEditPanelEvents = null;
    };
    _disposeEditPanelEvents = dispose;
    return dispose;
}
