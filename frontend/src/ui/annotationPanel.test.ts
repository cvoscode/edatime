import { afterEach, describe, expect, it, vi } from 'vitest';

function buildDom(): void {
    document.body.innerHTML = `
        <button id="open-notes-panel-btn"></button>
        <div id="annotations-modal" hidden><button id="annotations-modal-close"></button></div>
        <button id="annotations-modal-add-note-btn"></button>
        <button id="annotations-modal-bookmark-btn"></button>
        <button id="annotations-export-btn"></button>
        <button id="annotations-clear-btn"></button>
        <div id="add-note-modal" hidden><button id="add-note-modal-close"></button><button id="add-note-cancel-btn"></button><button id="add-note-save-btn"></button></div>
        <input id="note-title-input" /><textarea id="note-content-input"></textarea><input id="note-color-input" />
        <div id="annotations-list"></div>`;
}

describe('annotation panel lifecycle', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
        document.body.innerHTML = '';
    });

    it('releases the add-note shortcut when disposed', async () => {
        buildDom();
        const { initAnnotationPanel } = await import('./annotationPanel.js');
        const dispose = initAnnotationPanel();
        dispose();

        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'N', ctrlKey: true, shiftKey: true, bubbles: true,
        }));

        expect(document.getElementById('add-note-modal')?.hidden).toBe(true);
    });

    it('uses the owning shell redraw action instead of a module-global callback', async () => {
        buildDom();
        vi.stubGlobal('confirm', vi.fn(() => true));
        const requestOverlayRender = vi.fn();
        const { initAnnotationPanel } = await import('./annotationPanel.js');
        const dispose = initAnnotationPanel({ requestOverlayRender });

        document.getElementById('annotations-clear-btn')!.click();

        expect(requestOverlayRender).toHaveBeenCalledTimes(1);
        dispose();
    });

    it('renders stored annotations without trusting their colour, type, or page', async () => {
        buildDom();
        document.body.insertAdjacentHTML('beforeend', '<button id="open-notes-panel-btn"></button>');
        window.localStorage.setItem('edatime-annotations', JSON.stringify([{
            id: 'a1', title: 'T', type: '<img src=x onerror=alert(1)>', page: '<b>p</b>',
            color: 'red;background:url(https://example.invalid/x)', createdAt: 0,
        }]));
        const { loadAnnotations } = await import('../chart/annotations.js');
        loadAnnotations();
        const { initAnnotationPanel } = await import('./annotationPanel.js');
        const dispose = initAnnotationPanel();

        document.getElementById('open-notes-panel-btn')!.click();

        const item = document.querySelector<HTMLElement>('.annotation-item')!;
        expect(item.getAttribute('style')).toBeNull();
        expect(item.querySelector('img, b')).toBeNull();
        expect(item.textContent).toContain('<img src=x onerror=alert(1)>');
        dispose();
    });

    it('keeps a valid hex annotation colour', async () => {
        buildDom();
        document.body.insertAdjacentHTML('beforeend', '<button id="open-notes-panel-btn"></button>');
        window.localStorage.setItem('edatime-annotations', JSON.stringify([{
            id: 'a2', title: 'T', type: 'note', page: 'signals', color: '#00aaff', createdAt: 0,
        }]));
        const { loadAnnotations } = await import('../chart/annotations.js');
        loadAnnotations();
        const { initAnnotationPanel } = await import('./annotationPanel.js');
        const dispose = initAnnotationPanel();

        document.getElementById('open-notes-panel-btn')!.click();

        expect(document.querySelector<HTMLElement>('.annotation-item')!.style.getPropertyValue('--annotation-color')).toBe('#00aaff');
        dispose();
    });
});
