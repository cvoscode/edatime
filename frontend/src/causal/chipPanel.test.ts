import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/index.js', () => ({
    renderSeriesChipList: ({ container, items, chipClass, postChipClass, postChipAttributes }: any) => {
        container.innerHTML = '';
        for (const item of items) {
            const chip = document.createElement('div');
            chip.className = `series-chip ${chipClass || ''}${item.checked ? ' active' : ''}`.trim();
            chip.dataset.col = item.column;
            if (postChipClass) {
                const extra = postChipClass(item);
                if (extra) chip.classList.add(extra);
            }
            for (const [key, value] of Object.entries(postChipAttributes || {})) {
                chip.setAttribute(key, String(value));
            }
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !!item.checked;
            chip.appendChild(checkbox);
            const label = document.createElement('span');
            label.className = 'chip-label';
            label.textContent = item.column;
            chip.appendChild(label);
            const color = document.createElement('input');
            color.type = 'color';
            color.className = 'chip-color-picker';
            chip.appendChild(color);
            const menu = document.createElement('button');
            menu.type = 'button';
            menu.className = 'chip-menu-btn';
            chip.appendChild(menu);
            container.appendChild(chip);
        }
    },
}));

import { renderColumnChips } from './chipPanel.js';
import { resetSelectionState, _selectedColumns, type CausalDeps } from './selectionState.js';

describe('renderColumnChips', () => {
    beforeEach(() => {
        resetSelectionState();
        document.body.innerHTML = `
            <div id="causal-columns-bar"></div>
            <div id="causal-empty-state"></div>
            <input id="causal-tau-max" value="2" />
        `;
    });

    it('renders non-numeric metadata chips as non-interactive labels', () => {
        const deps: CausalDeps = {
            getMetadata: () => ({
                numeric_columns: ['HUFL', 'OT'],
                columns: [
                    { name: 'date', dtype: 'datetime64[ns]' },
                    { name: 'HUFL', dtype: 'float64' },
                    { name: 'OT', dtype: 'float64' },
                ],
            }),
            chipColor: () => '#00a8ff',
            numericColumns: () => ['HUFL', 'OT'],
            setLoading: () => undefined,
        };

        const columnsBar = document.getElementById('causal-columns-bar') as HTMLElement;
        renderColumnChips(deps, columnsBar, vi.fn());

        const metaChip = columnsBar.querySelector<HTMLElement>('[data-col="date"]');
        expect(metaChip).toBeTruthy();
        expect(metaChip?.classList.contains('causal-chip-nonnumeric')).toBe(true);
        expect(metaChip?.querySelector('input[type="checkbox"]')).toBeNull();
        expect(metaChip?.querySelector('.chip-color-picker')).toBeNull();
        expect(metaChip?.querySelector('.chip-menu-btn')).toBeNull();
    });

    it('select-all toggles only numeric columns', () => {
        const deps: CausalDeps = {
            getMetadata: () => ({
                numeric_columns: ['HUFL', 'OT'],
                columns: [
                    { name: 'date', dtype: 'datetime64[ns]' },
                    { name: 'HUFL', dtype: 'float64' },
                    { name: 'OT', dtype: 'float64' },
                ],
            }),
            chipColor: () => '#00a8ff',
            numericColumns: () => ['HUFL', 'OT'],
            setLoading: () => undefined,
        };

        const columnsBar = document.getElementById('causal-columns-bar') as HTMLElement;
        renderColumnChips(deps, columnsBar, vi.fn());

        (columnsBar.querySelector('.causal-column-action') as HTMLButtonElement).click();
        expect(Array.from(_selectedColumns).sort()).toEqual(['HUFL', 'OT']);
    });
});
