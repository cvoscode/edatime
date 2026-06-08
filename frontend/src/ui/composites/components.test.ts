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

        const color = root.querySelector<HTMLInputElement>('input[type="color"]')!;
        color.value = '#445566';
        color.dispatchEvent(new Event('input'));
        expect(onColorInput).toHaveBeenCalledWith('value', '#445566');

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
            items: [{ key: 'v1', name: 'value', range: '1 -> 2' }],
            onActivate,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onActivate).toHaveBeenCalledWith({ key: 'v1', name: 'value', range: '1 -> 2' });
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

    it('RangeControls static chip (no onActivate) has no keyboard binding', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 's1', name: 'Static', range: 'no-click', kind: 'static' }],
            onActivate,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        // Static chip — not interactive regardless of top-level onActivate
        expect(chip.getAttribute('role')).toBeNull();

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('RangeControls clickable chip responds to Enter keydown', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 'c1', name: 'Clickable', range: '1->2' }],
            onActivate,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        // Top-level onActivate: called with full item
        expect(onActivate).toHaveBeenCalledWith({ key: 'c1', name: 'Clickable', range: '1->2' });
    });

    it('RangeControls mixed row: static chip has no keyboard, clickable chip activates', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [
                { key: 's1', name: 'Static', range: 'fixed', kind: 'static' },   // static — non-interactive
                { key: 'c1', name: 'Clickable', range: '2->3' },                  // clickable — onActivate at top level
            ],
            onActivate,
        });

        const chips = root.querySelectorAll<HTMLElement>('.range-chip');
        const staticChip = chips[0];
        const clickableChip = chips[1];

        expect(staticChip.getAttribute('role')).toBeNull();
        staticChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).not.toHaveBeenCalled();

        clickableChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).toHaveBeenCalledWith({ key: 'c1', name: 'Clickable', range: '2->3' });
    });

    // ----------------------------------------------------------------
    // Tests below document the interface AFTER Phase 2 migration.
    // They will fail at runtime until RangeControls/RangeChip are updated
    // to support key + kind + per-item onActivate routing.
    // TypeScript errors are suppressed with `as any` since the new
    // interface does not exist yet — these test the *future* contract.
    // ----------------------------------------------------------------

    it('RangeControls (post-migration): static chip has no keyboard binding', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 's1', name: 'Static', range: 'no-click', kind: 'static' }] as any,
            onActivate,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        expect(chip.getAttribute('role')).toBeNull();

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).not.toHaveBeenCalled();
    });

    it('RangeControls (post-migration): clickable chip routes onActivate with key', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [{ key: 'col-hufl', name: 'HUFL', range: '0.1→0.9', kind: 'column-range', onActivate }] as any,
        });

        const chip = root.querySelector<HTMLElement>('.range-chip')!;
        expect(chip.getAttribute('role')).toBe('button');

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).toHaveBeenCalledWith('col-hufl');

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(onActivate).toHaveBeenCalledTimes(2);
    });

    it('RangeControls (post-migration): mixed static + clickable rows route correctly', () => {
        const onActivate = vi.fn();
        const root = RangeControls({
            items: [
                { key: 'static-1', name: 'Adaptive target', range: 'HUFL', kind: 'static' },
                { key: 'col-hufl', name: 'HUFL', range: '0.1→0.9', kind: 'column-range', onActivate },
            ] as any,
        });

        const chips = root.querySelectorAll<HTMLElement>('.range-chip');
        const staticChip = chips[0];
        const clickableChip = chips[1];

        expect(staticChip.getAttribute('role')).toBeNull();
        staticChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).not.toHaveBeenCalled();

        clickableChip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(onActivate).toHaveBeenCalledWith('col-hufl');
    });
});
