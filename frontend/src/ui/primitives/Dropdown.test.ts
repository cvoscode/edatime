import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDropdown,
    getDropdownController,
    getDropdownOptions,
    getDropdownValue,
    setDropdownDisabled,
    setDropdownOptions,
    setDropdownValue,
    upgradeSelectElement,
} from './Dropdown.js';

describe('Dropdown primitive', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('creates a custom dropdown that emits change when an option is selected', () => {
        const onChange = vi.fn();
        const dropdown = createDropdown({
            id: 'metric-select',
            label: 'Metric',
            value: 'spearman',
            options: [
                { value: 'pearson', label: 'Pearson' },
                { value: 'spearman', label: 'Spearman' },
            ],
            onChange,
        });
        document.body.appendChild(dropdown.root);

        expect(dropdown.trigger.textContent).toContain('Spearman');

        dropdown.trigger.click();
        const pearson = dropdown.menu.querySelector<HTMLElement>('[data-value="pearson"]');
        expect(pearson).not.toBeNull();
        pearson!.click();

        expect(dropdown.getValue()).toBe('pearson');
        expect(dropdown.trigger.textContent).toContain('Pearson');
        expect(onChange).toHaveBeenCalledWith('pearson');
    });

    it('supports keyboard navigation and closes on escape/outside click', () => {
        const dropdown = createDropdown({
            id: 'window-select',
            label: 'Window',
            value: '128',
            options: [
                { value: '64', label: '64' },
                { value: '128', label: '128' },
                { value: '256', label: '256' },
            ],
        });
        document.body.appendChild(dropdown.root);

        dropdown.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(dropdown.root.classList.contains('dropdown--open')).toBe(true);

        dropdown.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        dropdown.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(dropdown.getValue()).toBe('256');

        dropdown.trigger.click();
        expect(dropdown.root.classList.contains('dropdown--open')).toBe(true);
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(dropdown.root.classList.contains('dropdown--open')).toBe(false);

        dropdown.trigger.click();
        dropdown.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(dropdown.root.classList.contains('dropdown--open')).toBe(false);
    });

    it('upgrades a native select into a registered dropdown and supports helper updates', () => {
        document.body.innerHTML = `
            <select id="scatter-render-mode" class="modal-select" aria-label="Scatter render mode">
                <option value="scatter">Scatter</option>
                <option value="density" selected>Density</option>
            </select>
        `;

        const select = document.getElementById('scatter-render-mode') as HTMLSelectElement;
        const dropdown = upgradeSelectElement(select);

        expect(dropdown.root.id).toBe('scatter-render-mode');
        expect(document.querySelector('select#scatter-render-mode')).toBeNull();
        expect(getDropdownController('scatter-render-mode')).toBe(dropdown);
        expect(getDropdownValue('scatter-render-mode')).toBe('density');

        setDropdownValue('scatter-render-mode', 'scatter');
        expect(dropdown.getValue()).toBe('scatter');

        setDropdownOptions('scatter-render-mode', [
            { value: 'box', label: 'Box' },
            { value: 'arrow', label: 'Arrow' },
        ], { preferredValue: 'arrow' });
        expect(getDropdownOptions('scatter-render-mode')).toEqual([
            { value: 'box', label: 'Box', disabled: false },
            { value: 'arrow', label: 'Arrow', disabled: false },
        ]);
        expect(getDropdownValue('scatter-render-mode')).toBe('arrow');

        setDropdownDisabled('scatter-render-mode', true);
        expect(dropdown.trigger.disabled).toBe(true);
    });
});
