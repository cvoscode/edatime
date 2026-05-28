import { ColorInput } from '../atoms/ColorInput.js';

export interface SeriesChipProps {
    column: string;
    checked: boolean;
    color: string;
    adaptiveTarget?: boolean;
    onToggle?: (checked: boolean) => void;
    onColorInput?: (color: string) => void;
    onMenu?: () => void;
}

export function SeriesChip(props: SeriesChipProps): HTMLLabelElement {
    const chip = document.createElement('label');
    chip.className = `series-chip${props.checked ? ' active' : ''}${props.adaptiveTarget ? ' adaptive-target' : ''}`;
    chip.style.setProperty('--chip-accent', props.color);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = props.checked;
    checkbox.value = props.column;
    checkbox.setAttribute('aria-label', `Toggle ${props.column} series`);
    checkbox.addEventListener('change', () => props.onToggle?.(checkbox.checked));

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = props.column;

    const colorInput = ColorInput({
        label: `Set ${props.column} color`,
        value: props.color,
        className: 'chip-color-picker',
        onInput: props.onColorInput,
    });

    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'chip-menu-btn';
    menu.setAttribute('aria-label', `Filter range for ${props.column}`);
    menu.title = `Filter range for ${props.column}`;
    menu.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';
    menu.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onMenu?.();
    });

    chip.append(checkbox, colorInput, label, menu);
    return chip;
}
