import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    setupFlexibleNumberInput,
    upgradeFlexibleNumberInputs,
} from './FlexibleNumberInput.js';

describe('FlexibleNumberInput primitive', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('strips native min/max so the browser does not block keystrokes', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '10';
        input.value = '3';
        document.body.appendChild(input);

        setupFlexibleNumberInput(input);

        expect(input.hasAttribute('min')).toBe(false);
        expect(input.hasAttribute('max')).toBe(false);
        expect(input.dataset.flexMin).toBe('1');
        expect(input.dataset.flexMax).toBe('10');
        expect(input.classList.contains('flexible-number')).toBe(true);
    });

    it('clamps out-of-range values on commit and flags the warning class', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '10';
        input.value = '5';
        document.body.appendChild(input);

        const onCommit = vi.fn();
        setupFlexibleNumberInput(input, { onCommit });

        input.value = '42';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(input.value).toBe('10');
        expect(input.classList.contains('is-clamped')).toBe(true);
        expect(onCommit).toHaveBeenLastCalledWith(10, 42, true);
    });

    it('clamps values below the minimum on commit', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '1';
        input.value = '0.5';
        document.body.appendChild(input);

        const onCommit = vi.fn();
        setupFlexibleNumberInput(input, { onCommit });

        input.value = '-5';
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(input.value).toBe('0');
        expect(input.classList.contains('is-clamped')).toBe(true);
        expect(onCommit).toHaveBeenLastCalledWith(0, -5, true);
    });

    it('leaves in-range values untouched and does not flag warnings', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '10';
        input.value = '0';
        document.body.appendChild(input);

        const onCommit = vi.fn();
        setupFlexibleNumberInput(input, { onCommit });

        input.value = '7';
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(input.value).toBe('7');
        expect(input.classList.contains('is-clamped')).toBe(false);
        expect(onCommit).toHaveBeenLastCalledWith(7, 7, false);
    });

    it('commits empty values as null without flagging warnings', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.value = '5';
        document.body.appendChild(input);

        const onCommit = vi.fn();
        setupFlexibleNumberInput(input, { onCommit });

        input.value = '';
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(input.classList.contains('is-clamped')).toBe(false);
        expect(onCommit).toHaveBeenLastCalledWith(null, null, false);
    });

    it('formats the clamped value using the input step precision', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '1';
        input.step = '0.01';
        input.value = '0.5';
        document.body.appendChild(input);

        setupFlexibleNumberInput(input);

        input.value = '0.123456';
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        expect(input.value).toBe('0.12');
        expect(input.classList.contains('is-clamped')).toBe(false);
    });

    it('clears the warning class on the next keystroke', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '10';
        input.value = '5';
        document.body.appendChild(input);

        setupFlexibleNumberInput(input);

        input.value = '99';
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        expect(input.classList.contains('is-clamped')).toBe(true);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(input.classList.contains('is-clamped')).toBe(false);
    });

    it('restores min/max attributes on destroy', () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '10';
        document.body.appendChild(input);

        const controller = setupFlexibleNumberInput(input);
        controller.destroy();

        expect(input.getAttribute('min')).toBe('1');
        expect(input.getAttribute('max')).toBe('10');
        expect(input.classList.contains('flexible-number')).toBe(false);
    });

    it('upgradeFlexibleNumberInputs scans the document for matching inputs', () => {
        document.body.innerHTML = `
            <input id="a" type="number" class="modal-input" min="0" max="5" value="1">
            <input id="b" type="number" class="modal-input" min="0" max="5" value="2">
            <input id="c" type="number" class="ctrl-sm" min="0" max="5" value="3">
            <input id="d" type="text" class="modal-input" value="not a number">
            <input id="e" type="number" value="4">
        `;

        const controllers = upgradeFlexibleNumberInputs(document);
        // Three matching inputs: two .modal-input[type=number] and one .ctrl-sm[type=number].
        // The plain number input and the text input are intentionally skipped.
        expect(controllers).toHaveLength(3);
        const a = document.getElementById('a') as HTMLInputElement;
        expect(a.classList.contains('flexible-number')).toBe(true);
        expect(a.hasAttribute('min')).toBe(false);

        const plain = document.getElementById('e') as HTMLInputElement;
        expect(plain.classList.contains('flexible-number')).toBe(false);
    });

    it('does not double-upgrade inputs', () => {
        document.body.innerHTML = '<input id="x" type="number" class="modal-input" min="0">';
        const first = upgradeFlexibleNumberInputs(document);
        const second = upgradeFlexibleNumberInputs(document);
        expect(first).toHaveLength(1);
        expect(second).toHaveLength(0);
    });
});