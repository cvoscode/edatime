import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './ColorPicker.js';

describe('ColorPicker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders a swatch button with the current color as background', () => {
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF' });
        document.body.appendChild(picker.element);
        const button = picker.element.querySelector('.color-picker__swatch') as HTMLButtonElement | null;
        expect(button).not.toBeNull();
        expect(button?.getAttribute('aria-label')).toBe('HUFL');
        expect(button?.style.getPropertyValue('--color-picker-current')).toBe('#00A8FF');
    });

    it('opens the popover with presets when the swatch is clicked', () => {
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF', onInput: vi.fn() });
        document.body.appendChild(picker.element);
        const button = picker.element.querySelector<HTMLButtonElement>('.color-picker__swatch')!;
        button.click();
        const popover = document.querySelector('.color-picker-popover');
        expect(popover).not.toBeNull();
        const presets = popover?.querySelectorAll('.color-picker__preset');
        expect(presets?.length).toBe(8);
    });

    it('fires onInput when a preset is clicked', () => {
        const onInput = vi.fn();
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF', onInput });
        document.body.appendChild(picker.element);
        picker.element.querySelector<HTMLButtonElement>('.color-picker__swatch')!.click();
        const preset = document.querySelector<HTMLButtonElement>('.color-picker__preset[data-color="#FFC041"]')!;
        preset.click();
        expect(onInput).toHaveBeenCalled();
        const firstCall = onInput.mock.calls[0];
        expect(firstCall?.[0]).toBe('#FFC041');
    });

    it('fires onInput when the hex input is updated with a valid color', () => {
        const onInput = vi.fn();
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF', onInput });
        document.body.appendChild(picker.element);
        picker.element.querySelector<HTMLButtonElement>('.color-picker__swatch')!.click();
        const hex = document.querySelector<HTMLInputElement>('.color-picker__hex-input')!;
        hex.value = '#FF6B6B';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        expect(onInput).toHaveBeenCalled();
        expect(onInput.mock.calls[0]?.[0]).toBe('#FF6B6B');
    });

    it('ignores hex input that does not match the #RRGGBB shape', () => {
        const onInput = vi.fn();
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF', onInput });
        document.body.appendChild(picker.element);
        picker.element.querySelector<HTMLButtonElement>('.color-picker__swatch')!.click();
        const hex = document.querySelector<HTMLInputElement>('.color-picker__hex-input')!;
        hex.value = 'not-a-color';
        hex.dispatchEvent(new Event('input', { bubbles: true }));
        expect(onInput).not.toHaveBeenCalled();
    });

    it('updateValue mirrors a fresh color into the swatch without opening the popover', () => {
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF' });
        document.body.appendChild(picker.element);
        picker.updateValue('#FFC041');
        expect(picker.element.querySelector<HTMLElement>('.color-picker__swatch-fill')?.style.backgroundColor).toBe('#FFC041');
        expect(picker.element.querySelector<HTMLElement>('.color-picker__swatch')?.style.getPropertyValue('--color-picker-current')).toBe('#FFC041');
    });

    it('updateValue updates active preset highlight when the popover is open', () => {
        const picker = ColorPicker({ label: 'HUFL', value: '#00A8FF' });
        document.body.appendChild(picker.element);
        picker.element.querySelector<HTMLButtonElement>('.color-picker__swatch')!.click();
        picker.updateValue('#FFC041');
        const active = document.querySelectorAll('.color-picker__preset.is-active');
        expect(active.length).toBe(1);
        expect(active[0]?.getAttribute('aria-pressed')).toBe('true');
    });
});
