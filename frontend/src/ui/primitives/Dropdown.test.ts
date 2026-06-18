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

    it('renders a search row when searchable=true and filters options as the user types', () => {
        const onChange = vi.fn();
        const dropdown = createDropdown({
            id: 'column-picker',
            label: 'Columns',
            options: [
                { value: 'temperature', label: 'temperature' },
                { value: 'humidity', label: 'humidity' },
                { value: 'pressure', label: 'pressure' },
                { value: 'wind_speed', label: 'wind_speed' },
            ],
            searchable: true,
            onChange,
        });
        document.body.appendChild(dropdown.root);

        dropdown.trigger.click();
        const search = dropdown.menu.querySelector<HTMLInputElement>('input.dropdown__search');
        expect(search).not.toBeNull();
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(4);

        // Simulate the user typing into the search box.
        search!.value = 'hum';
        search!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(1);
        expect(dropdown.menu.querySelector('.dropdown__option')?.textContent).toContain('humidity');

        // Case-insensitive substring match.
        search!.value = 'PRESS';
        search!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(1);

        // No matches → empty state.
        search!.value = 'zzz';
        search!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(0);
        expect(dropdown.menu.querySelector('.dropdown__empty')).not.toBeNull();

        // Clearing the search restores the full list.
        search!.value = '';
        search!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(4);
    });

    it('lets the user select a filtered option from a searchable dropdown', () => {
        const onChange = vi.fn();
        const dropdown = createDropdown({
            id: 'pair-picker',
            label: 'Pairs',
            options: [
                { value: 'a_b', label: 'A → B' },
                { value: 'a_c', label: 'A → C' },
                { value: 'b_c', label: 'B → C' },
            ],
            searchable: true,
            onChange,
        });
        document.body.appendChild(dropdown.root);

        dropdown.trigger.click();
        const search = dropdown.menu.querySelector<HTMLInputElement>('input.dropdown__search')!;
        // The arrow glyph differs from a space, so we filter on a substring
        // that only one label contains.
        search.value = 'a →';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(2);

        // Now narrow to a single label.
        search.value = 'a → c';
        search.dispatchEvent(new Event('input', { bubbles: true }));

        const option = dropdown.menu.querySelector<HTMLButtonElement>('[data-value="a_c"]');
        expect(option).not.toBeNull();
        option!.click();

        expect(dropdown.getValue()).toBe('a_c');
        expect(onChange).toHaveBeenCalledWith('a_c');
    });

    it('resets the active search query when options change', () => {
        const dropdown = createDropdown({
            id: 'reset-test',
            label: 'Reset',
            options: [
                { value: 'one', label: 'one' },
                { value: 'two', label: 'two' },
            ],
            searchable: true,
        });
        document.body.appendChild(dropdown.root);

        dropdown.trigger.click();
        const search = dropdown.menu.querySelector<HTMLInputElement>('input.dropdown__search')!;
        search.value = 'two';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(1);

        dropdown.close();
        setDropdownOptions('reset-test', [
            { value: 'alpha', label: 'alpha' },
            { value: 'beta', label: 'beta' },
        ]);

        dropdown.trigger.click();
        const refreshedSearch = dropdown.menu.querySelector<HTMLInputElement>('input.dropdown__search')!;
        expect(refreshedSearch.value).toBe('');
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(2);
    });

    it('lazily enables and disables the search row via setSearchable / setOptions', () => {
        const dropdown = createDropdown({
            id: 'lazy-search',
            label: 'Lazy',
            options: [
                { value: 'one', label: 'one' },
                { value: 'two', label: 'two' },
            ],
        });
        document.body.appendChild(dropdown.root);

        expect(dropdown.isSearchable()).toBe(false);
        expect(dropdown.menu.querySelector('input.dropdown__search')).toBeNull();

        // Enable via controller and re-open.
        dropdown.setSearchable(true);
        expect(dropdown.isSearchable()).toBe(true);

        dropdown.trigger.click();
        const search = dropdown.menu.querySelector<HTMLInputElement>('input.dropdown__search');
        expect(search).not.toBeNull();
        search!.value = 'tw';
        search!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(1);
        dropdown.close();

        // Disable again; the search row is removed and the filter clears.
        dropdown.setSearchable(false);
        expect(dropdown.isSearchable()).toBe(false);
        dropdown.trigger.click();
        expect(dropdown.menu.querySelector('input.dropdown__search')).toBeNull();
        expect(dropdown.menu.querySelectorAll('.dropdown__option')).toHaveLength(2);
        dropdown.close();

        // Toggling via setOptions config also works.
        setDropdownOptions('lazy-search', [
            { value: 'a', label: 'a' },
            { value: 'b', label: 'b' },
        ], { searchable: true });
        dropdown.trigger.click();
        expect(dropdown.menu.querySelector('input.dropdown__search')).not.toBeNull();
    });
});
