import { describe, expect, it, vi } from 'vitest';
import { ColumnFilterModal } from './ColumnFilterModal.js';
import { ColumnSelector } from './ColumnSelector.js';
import { RangeControls } from './RangeControls.js';

describe('DOM component factories', () => {
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

        const color = root.querySelector<HTMLInputElement>('input[type="color"]')!;
        color.value = '#445566';
        color.dispatchEvent(new Event('input'));
        expect(onColorInput).toHaveBeenCalledWith('value', '#445566');

        root.querySelector<HTMLButtonElement>('.chip-menu-btn')!.click();
        expect(onOpenRange).toHaveBeenCalledWith('value');

        const select = root.querySelector<HTMLSelectElement>('select')!;
        select.value = 'value';
        select.dispatchEvent(new Event('change'));
        expect(onColorByChange).toHaveBeenCalledWith('value');
    });

    it('RangeControls activates clickable range chips with keyboard support', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ name: 'value', range: '1 -> 2' }],
            onActivate,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onActivate).toHaveBeenCalledWith({ name: 'value', range: '1 -> 2' });
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
});
