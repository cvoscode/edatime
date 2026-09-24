import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '../../workspace/workspaceStore.js';
import { emitNavigationChange } from '../../platform/navigationEvents.js';
import { setRollingEnabled } from '../../store/analyticsState.js';
import { createDropdown, getDropdownController } from '../../ui/primitives/Dropdown.js';
import { initToolbarModals } from '../../ui/exportControls.js';
import { initSignalsToolbar } from './toolbar.js';

const html = readFileSync('frontend/index.html', 'utf8');
const toolbarHtml = html.slice(html.indexOf('<div id="timeseries-chart-toolbar"'), html.indexOf('<main class="main main--analysis-chart"'));

describe('Signals toolbar lifecycle', () => {
    let workspace: ReturnType<typeof createWorkspaceStore>;
    let dispose: () => void;
    let render = vi.fn<() => void>();
    const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
    const open = (id: string) => {
        const details = element<HTMLDetailsElement>(id);
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
        return details;
    };

    beforeEach(() => {
        document.body.innerHTML = toolbarHtml + '<button id="outside">Outside</button>';
        workspace = createWorkspaceStore();
        render = vi.fn<() => void>();
        dispose = initSignalsToolbar({ workspace, renderCurrentData: render });
    });

    afterEach(() => {
        dispose();
        getDropdownController('draw-tool')?.destroy();
        workspace.dispose();
        setRollingEnabled(false);
        document.body.innerHTML = '';
    });

    it('keeps one panel open and restores keyboard focus on Escape', () => {
        const draw = open('timeseries-draw-tools');
        const custom = open('quick-range-custom');
        expect(draw.open).toBe(false);
        element('quick-range-custom-start').focus();
        element('quick-range-custom-start').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(custom.open).toBe(false);
        expect(document.activeElement).toBe(custom.querySelector('summary'));
        expect(custom.querySelector('summary')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('dismisses panels on outside interaction, tabbing away, and navigation', () => {
        const draw = open('timeseries-draw-tools');
        element('outside').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(draw.open).toBe(false);
        open('timeseries-draw-tools');
        element('outside').focus();
        expect(draw.open).toBe(false);
        open('timeseries-draw-tools');
        emitNavigationChange({ page: 'scatter', navPage: 'scatter' });
        expect(draw.open).toBe(false);
    });

    it('returns from the export dialog to the visible menu trigger', () => {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="export-options-modal" hidden><div role="dialog">
                <button id="export-options-close-btn">Close</button>
                <button id="export-options-done-btn">Done</button>
            </div></div>`);
        const disposeModals = initToolbarModals({ onZoomOut: vi.fn(), onResetZoom: vi.fn() });
        const menu = document.querySelector<HTMLDetailsElement>('.signals-toolbar__export')!;
        menu.open = true;
        const button = element('open-export-options-btn');
        button.focus();
        button.click();
        expect(menu.open).toBe(false);
        expect(element('export-options-modal').hidden).toBe(false);
        expect(document.activeElement).toBe(element('export-options-close-btn'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(document.activeElement).toBe(element('export-options-done-btn'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(element('export-options-modal').hidden).toBe(true);
        expect(document.activeElement).toBe(menu.querySelector('summary'));
        disposeModals();
    });

    it('lets a nested dropdown consume Escape before closing the drawing panel', () => {
        const select = element('draw-tool');
        const dropdown = createDropdown({ id: 'draw-tool', label: 'Draw tool', value: 'none', options: [
            { value: 'none', label: 'Zoom / inspect' }, { value: 'arrow', label: 'Arrow' },
        ] });
        select.replaceWith(dropdown.root);
        const draw = open('timeseries-draw-tools');
        dropdown.open();
        dropdown.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(draw.open).toBe(true);
        expect(dropdown.trigger.getAttribute('aria-expanded')).toBe('false');
        dropdown.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(draw.open).toBe(false);
        dropdown.destroy();
    });

    it('reflects applied ranges, chart labels, filters, and analytics without opening a panel', () => {
        const min = Date.UTC(2026, 0, 1);
        const max = Date.UTC(2026, 3, 1);
        workspace.commitDataset(workspace.beginDatasetSession(), {
            columns: [], numeric_columns: [], column_profiles: [], total_rows: 10000,
            time_column: 'time', time_range: { min, max },
        }, 1);
        expect(element('quick-range-all').getAttribute('aria-pressed')).toBe('true');
        workspace.setViewport({ xMin: max - 7 * 86_400_000, xMax: max, yMin: null, yMax: null });
        expect(element('quick-range-7d').getAttribute('aria-pressed')).toBe('true');
        expect(element('quick-range-all').getAttribute('aria-pressed')).toBe('false');
        workspace.setViewport({ xMin: min + 1234, xMax: max - 4567, yMin: null, yMax: null });
        expect(element('quick-range-custom').querySelector('summary')?.hasAttribute('data-active')).toBe(true);
        workspace.setFilters({ columnRanges: { HUFL: { from: 1, to: 5 } }, adaptiveLines: [] });
        expect(element('timeseries-filter-status').textContent).toBe('1 active filter');
        expect(element('timeseries-filter-status').hidden).toBe(false);
        workspace.setAppearance({ chartText: { title: 'Signal review', xLabel: '', yLabel: '' } });
        expect(document.querySelector<HTMLElement>('[data-signals-state="labels"]')?.hidden).toBe(false);
        setRollingEnabled(true);
        expect(document.querySelector<HTMLElement>('[data-signals-state="analytics"]')?.hidden).toBe(false);
        workspace.setFilters({ columnRanges: {}, adaptiveLines: [] });
        expect(element('timeseries-filter-status').hidden).toBe(true);
    });

    it('keeps the selected drawing mode visible after closing the panel', () => {
        const select = element<HTMLSelectElement>('draw-tool');
        select.value = 'box';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(element('timeseries-draw-mode').hidden).toBe(false);
        expect(element('timeseries-draw-mode').textContent).toBe('Box');
        select.value = 'none';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        expect(element('timeseries-draw-mode').hidden).toBe(true);
    });

    it('releases listeners and subscriptions before reinitialization', () => {
        const toggle = element<HTMLInputElement>('timeseries-normalize-series');
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        expect(render).toHaveBeenCalledTimes(1);
        dispose();
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        workspace.setFilters({ columnRanges: { HUFL: { from: 1, to: 5 } }, adaptiveLines: [] });
        expect(element('timeseries-filter-status').hidden).toBe(true);
        expect(render).toHaveBeenCalledTimes(1);
        dispose = initSignalsToolbar({ workspace, renderCurrentData: render });
        expect(element('timeseries-filter-status').hidden).toBe(false);
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        expect(render).toHaveBeenCalledTimes(2);
    });
});
