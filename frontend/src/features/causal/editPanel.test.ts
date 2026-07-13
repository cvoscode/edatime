import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindEditPanelEvents, showCtxMenu } from './editPanel.js';

describe('causal edit-panel event binding', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="causal-ctx-menu" hidden></div>';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('replaces prior document listeners and returns a working disposer', () => {
        bindEditPanelEvents();
        const dispose = bindEditPanelEvents();
        showCtxMenu(1, 2, { kind: 'node', col: 'A' });
        const menu = document.getElementById('causal-ctx-menu')!;

        dispose();
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(menu.hidden).toBe(false);
    });
});
