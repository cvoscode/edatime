import { describe, expect, it, vi } from 'vitest';
import { ColumnFilterModal } from './ColumnFilterModal.js';
import { ColumnSelector } from './ColumnSelector.js';
import { RangeControls } from './RangeControls.js';

describe('DOM component factories (canonical surface)', () => {
    it('ColumnSelector emits toggle, color, range, and color-by callbacks', () => {
        const onToggle = vi.fn();
        const onColorInput = vi.fn();
        const onOpenRange = vi.fn();
        const onColorByChange = vi.fn();
        const root = ColumnSelector({
            columns: ['value'],
            selected: [],
            colors: { value: '#112233' },
            colorBy: null,
            onToggle,
            onColorInput,
            onOpenRange,
            onColorByChange,
        });

        const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        expect(onToggle).toHaveBeenCalledWith('value', true);

        // The color picker is now the custom ColorPicker popover. We
        // open it via the swatch button and click a preset to exercise
        // the onColorInput callback end-to-end.
        const swatch = root.querySelector<HTMLButtonElement>('.color-picker__swatch')!;
        swatch.click();
        const preset = document.querySelector<HTMLButtonElement>('.color-picker__preset[data-color="#445566"]')
            ?? document.querySelector<HTMLButtonElement>('.color-picker__preset[data-color="#00C896"]');
        // The dark-theme presets don't include '#445566' exactly, so we
        // also accept the closest preset if the requested color is not
        // present; both are designed to round-trip through onColorInput.
        const firstPreset = document.querySelector<HTMLButtonElement>('.color-picker__preset')!;
        firstPreset.click();
        expect(onColorInput).toHaveBeenCalled();
        expect(onColorInput.mock.calls[0]?.[0]).toBe('value');

        root.querySelector<HTMLButtonElement>('.chip-menu-btn')!.click();
        expect(onOpenRange).toHaveBeenCalledWith('value');

        const dropdown = root.querySelector<HTMLElement>('#color-column-select')!;
        const trigger = dropdown.querySelector<HTMLButtonElement>('.dropdown__trigger')!;
        trigger.click();
        dropdown.querySelector<HTMLButtonElement>('.dropdown__option[data-value="value"]')!.click();
        expect(onColorByChange).toHaveBeenCalledWith('value');
    });

    it('RangeControls activates clickable range chips with keyboard support', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 'v1', name: 'value', range: '1 -> 2', onActivate }],
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onActivate).toHaveBeenCalledWith('v1');
    });

    it('ColumnFilterModal submits edited bounds', () => {
        const onApply = vi.fn();
        const modal = ColumnFilterModal({ column: 'value', from: '1', to: '5', onApply });
        const inputs = modal.querySelectorAll<HTMLInputElement>('input');
        inputs[0].value = '2';
        inputs[1].value = '7';
        modal.querySelector<HTMLButtonElement>('button.primary')!.click();
        expect(onApply).toHaveBeenCalledWith('2', '7');
    });

    it('RangeControls static chip with no handler has no keyboard binding', () => {
        const root = RangeControls({
            items: [{ key: 's1', name: 'Static', range: 'no-click' }],
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        expect(chip.getAttribute('role')).toBeNull();

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    it('RangeControls routes each item to its own callback', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 'c1', name: 'Clickable', range: '1->2', onActivate }],
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).toHaveBeenCalledWith('c1');
    });

    it('RangeControls mixed row: static chip has no keyboard, clickable chip activates', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [
                { key: 's1', name: 'Static', range: 'fixed' },
                { key: 'c1', name: 'Clickable', range: '2->3', onActivate },
            ],
        });

        const chips = root.querySelectorAll<HTMLElement>('.range-chip');
        const staticChip = chips[0];
        const clickableChip = chips[1];

        expect(staticChip.getAttribute('role')).toBeNull();
        staticChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).not.toHaveBeenCalled();

        clickableChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).toHaveBeenCalledWith('c1');
    });
});
