import { describe, expect, it, vi } from 'vitest';
import { SeriesChip } from './SeriesChip.js';

describe('SeriesChip', () => {
    it('renders with correct structure', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#ff0000',
        });
        expect(chip.tagName).toBe('LABEL');
        expect(chip.className).toBe('series-chip');
        expect(chip.querySelector('input[type="checkbox"]')).toBeTruthy();
        expect(chip.querySelector('.chip-color-picker')).toBeTruthy();
        expect(chip.querySelector('.chip-label')?.textContent).toBe('test-col');
    });

    it('applies active class when checked', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: true,
            color: '#00ff00',
        });
        expect(chip.className).toContain('active');
    });

    it('calls onToggle when checkbox changes', () => {
        const onToggle = vi.fn();
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#0000ff',
            onToggle,
        });
        const checkbox = chip.querySelector('input[type="checkbox"]') as HTMLInputElement;
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('calls onColorInput when color changes', () => {
        const onColorInput = vi.fn();
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#000000',
            onColorInput,
        });
        const colorPicker = chip.querySelector('.chip-color-picker') as HTMLInputElement;
        colorPicker.value = '#aabbcc';
        colorPicker.dispatchEvent(new Event('input'));
        expect(onColorInput).toHaveBeenCalledWith('#aabbcc', expect.any(Object));
    });

    it('does not render menu button when onMenuClick not provided', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#123456',
        });
        expect(chip.querySelector('.chip-menu-btn')).toBeNull();
    });

    it('renders menu button and calls onMenuClick when provided', () => {
        const onMenuClick = vi.fn();
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#654321',
            onMenuClick,
            menuLabel: 'Open menu for test-col',
        });
        expect(chip.querySelector('.chip-menu-btn')).toBeTruthy();
        chip.querySelector('.chip-menu-btn')!.dispatchEvent(new MouseEvent('click'));
        expect(onMenuClick).toHaveBeenCalled();
    });

    it('stops propagation on color picker clicks', () => {
        const onToggle = vi.fn();
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#111111',
            onToggle,
        });
        const colorPicker = chip.querySelector('.chip-color-picker') as HTMLElement;
        const event = new MouseEvent('click', { bubbles: true });
        colorPicker.dispatchEvent(event);
        expect(onToggle).not.toHaveBeenCalled();
    });

    it('stops propagation on menu button clicks', () => {
        const onToggle = vi.fn();
        const onMenuClick = vi.fn();
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#222222',
            onToggle,
            onMenuClick,
        });
        const menuBtn = chip.querySelector('.chip-menu-btn') as HTMLElement;
        menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onToggle).not.toHaveBeenCalled();
        expect(onMenuClick).toHaveBeenCalled();
    });

    it('applies disabled styling when disabled prop is true', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: true,
            color: '#333333',
            disabled: true,
        });
        expect(chip.className).toContain('disabled');
        expect((chip.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true);
    });

    it('uses custom label when provided', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#444444',
            label: 'Custom Label',
        });
        expect(chip.querySelector('.chip-label')?.textContent).toBe('Custom Label');
    });

    it('uses custom title when provided', () => {
        const chip = SeriesChip({
            column: 'test-col',
            checked: false,
            color: '#555555',
            title: 'Custom tooltip',
        });
        expect(chip.title).toBe('Custom tooltip');
    });
});