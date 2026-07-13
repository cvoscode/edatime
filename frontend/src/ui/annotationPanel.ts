/**
 * Annotation panel UI for EdaTime.
 *
 * Wires up the "Notes" toolbar buttons on the timeseries page to
 * the annotations store, and manages the annotation list modal.
 */

import {
    getAnnotations,
    getAnnotationsForPage,
    createTimeRangeNote,
    createBookmark,
    deleteAnnotation,
    clearAllAnnotations,
    exportAnnotations,
    Annotation,
} from '../chart/annotations.js';
import { datasetState } from '../store/datasetState.js';
import { toast } from '../utils/toast.js';

export interface AnnotationPanelDeps {
    requestOverlayRender?: () => void;
    getViewport?: () => { start: number; end: number } | null;
}

/* ── Annotations list modal ─────────────────────────── */

function openAnnotationsModal(requestOverlayRender: () => void): void {
    const modal = document.getElementById('annotations-modal');
    if (!modal) return;
    renderAnnotationsList(requestOverlayRender);
    modal.hidden = false;
}

function closeAnnotationsModal(): void {
    const modal = document.getElementById('annotations-modal');
    if (modal) modal.hidden = true;
}

function renderAnnotationsList(requestOverlayRender: () => void): void {
    const container = document.getElementById('annotations-list');
    if (!container) return;
    const anns = getAnnotations();
    if (anns.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted, #888);padding:8px 0;">No annotations yet. Use "+ Note" or "+ Bookmark" to add.</p>';
        return;
    }
    container.innerHTML = anns.map((ann) => {
        const date = new Date(ann.createdAt).toLocaleString();
        const timeInfo = ann.timeRange
            ? `<span style="font-size:11px;color:var(--text-muted,#888)">${new Date(ann.timeRange.start).toISOString().slice(0, 16).replace('T', ' ')}${ann.timeRange.end !== ann.timeRange.start ? ' – ' + new Date(ann.timeRange.end).toISOString().slice(0, 16).replace('T', ' ') : ''}</span>`
            : '';
        return `
            <div class="annotation-item" data-ann-id="${escapeAttr(ann.id)}" style="border-left:3px solid ${escapeAttr(ann.color)};padding:8px 12px;margin-bottom:8px;background:var(--surface2,#1e1e2e);border-radius:4px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                    <strong>${escapeHtml(ann.title)}</strong>
                    <div style="display:flex;gap:6px;">
                        <span style="font-size:11px;color:var(--text-muted,#888)">${ann.type} · ${ann.page}</span>
                        <button class="btn btn-ghost btn-xs ann-delete-btn" data-ann-id="${escapeAttr(ann.id)}" type="button" title="Delete">✕</button>
                    </div>
                </div>
                ${timeInfo}
                ${ann.content ? `<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary,#ccc)">${escapeHtml(ann.content)}</p>` : ''}
                <div style="font-size:11px;color:var(--text-muted,#888);margin-top:2px">${date}</div>
            </div>
        `;
    }).join('');

    // Wire delete buttons
    container.querySelectorAll<HTMLButtonElement>('.ann-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.annId;
            if (id && confirm('Delete this annotation?')) {
                deleteAnnotation(id);
                renderAnnotationsList(requestOverlayRender);
                requestOverlayRender();
            }
        });
    });
}

/* ── Add Note modal ─────────────────────────────────── */

function openAddNoteModal(): void {
    const modal = document.getElementById('add-note-modal');
    if (!modal) return;
    (document.getElementById('note-title-input') as HTMLInputElement).value = '';
    (document.getElementById('note-content-input') as HTMLTextAreaElement).value = '';
    (document.getElementById('note-color-input') as HTMLInputElement).value = '#ffc041';
    modal.hidden = false;
    (document.getElementById('note-title-input') as HTMLInputElement).focus();
}

function closeAddNoteModal(): void {
    const modal = document.getElementById('add-note-modal');
    if (modal) modal.hidden = true;
}

function saveNote(
    requestOverlayRender: () => void,
    getViewport: () => { start: number; end: number } | null,
): void {
    const title = (document.getElementById('note-title-input') as HTMLInputElement).value.trim();
    if (!title) {
        toast('Please enter a title for the note.', 'error');
        return;
    }
    const content = (document.getElementById('note-content-input') as HTMLTextAreaElement).value.trim();
    const color = (document.getElementById('note-color-input') as HTMLInputElement).value;

    const viewport = getViewport();
    const end = Number(viewport?.end);
    const start = Number(viewport?.start);
    const resolvedEnd = Number.isFinite(end) ? end : Date.now();
    const resolvedStart = Number.isFinite(start) ? start : resolvedEnd - 3600_000;

    createTimeRangeNote(
        title,
        resolvedStart,
        resolvedEnd,
        content || undefined,
        undefined,
        color,
        datasetState.datasetRevision,
    );
    toast(`Note "${title}" saved.`, 'success');
    closeAddNoteModal();
    requestOverlayRender();
}

/* ── Bookmark ──────────────────────────────────────── */

function addBookmarkAtCurrentView(
    requestOverlayRender: () => void,
    getViewport: () => { start: number; end: number } | null,
): void {
    const time = Number(getViewport()?.start);
    const resolvedTime = Number.isFinite(time) ? time : Date.now();
    const title = `Bookmark ${new Date(resolvedTime).toLocaleTimeString()}`;
    createBookmark(title, resolvedTime, datasetState.datasetRevision);
    toast(`Bookmark added at ${new Date(resolvedTime).toLocaleString()}`, 'success');
    requestOverlayRender();
}

/* ── Helpers ─────────────────────────────────────────── */

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Init ──────────────────────────────────────────── */

export function initAnnotationPanel(deps: AnnotationPanelDeps = {}): () => void {
    const requestOverlayRender = deps.requestOverlayRender ?? (() => {});
    const getViewport = deps.getViewport ?? (() => null);
    const abortController = new AbortController();
    const listenerOptions = { signal: abortController.signal };
    // Toolbar buttons
    document.getElementById('open-notes-panel-btn')?.addEventListener('click', () => openAnnotationsModal(requestOverlayRender), listenerOptions);

    // Annotations list modal
    document.getElementById('annotations-modal-close')?.addEventListener('click', closeAnnotationsModal, listenerOptions);
    document.getElementById('annotations-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).id === 'annotations-modal') closeAnnotationsModal();
    }, listenerOptions);
    document.getElementById('annotations-modal-add-note-btn')?.addEventListener('click', openAddNoteModal, listenerOptions);
    document.getElementById('annotations-modal-bookmark-btn')?.addEventListener('click', () => addBookmarkAtCurrentView(requestOverlayRender, getViewport), listenerOptions);
    document.getElementById('annotations-export-btn')?.addEventListener('click', () => {
        const json = exportAnnotations();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edatime-annotations-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, listenerOptions);
    document.getElementById('annotations-clear-btn')?.addEventListener('click', () => {
        if (confirm('Clear all annotations? This cannot be undone.')) {
            clearAllAnnotations();
            renderAnnotationsList(requestOverlayRender);
            requestOverlayRender();
            toast('All annotations cleared.', 'success');
        }
    }, listenerOptions);

    // Add Note modal
    document.getElementById('add-note-modal-close')?.addEventListener('click', closeAddNoteModal, listenerOptions);
    document.getElementById('add-note-cancel-btn')?.addEventListener('click', closeAddNoteModal, listenerOptions);
    document.getElementById('add-note-save-btn')?.addEventListener('click', () => saveNote(requestOverlayRender, getViewport), listenerOptions);
    document.getElementById('add-note-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).id === 'add-note-modal') closeAddNoteModal();
    }, listenerOptions);

    // Keyboard shortcut: Ctrl+Shift+N = add note
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            openAddNoteModal();
        }
    }, listenerOptions);

    return () => {
        abortController.abort();
        closeAnnotationsModal();
        closeAddNoteModal();
    };
}
