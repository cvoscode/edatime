import { ColorInput } from '../primitives/ColorInput.js';

export interface SeriesChipProps {
    column: string;
    checked: boolean;
    color: string;
    disabled?: boolean;
    adaptiveTarget?: boolean;
    menuLabel?: string;
    label?: string;
    title?: string;
    onToggle?: (checked: boolean) => void;
    onColorInput?: (color: string) => void;
    onMenuClick?: () => void;
}

function createDotsSvg(): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const circles = [
        { cx: '8', cy: '3', r: '1.5' },
        { cx: '8', cy: '8', r: '1.5' },
        { cx: '8', cy: '13', r: '1.5' },
    ];
    for (const c of circles) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', c.cx);
        circle.setAttribute('cy', c.cy);
        circle.setAttribute('r', c.r);
        svg.appendChild(circle);
    }
    return svg;
}

export function SeriesChip(props: SeriesChipProps): HTMLLabelElement {
    const chip = document.createElement('label');
    chip.className = `series-chip${props.checked ? ' active' : ''}${props.adaptiveTarget ? ' adaptive-target' : ''}${props.disabled ? ' disabled' : ''}`;
    chip.style.setProperty('--chip-accent', props.color);
    if (props.title) chip.title = props.title;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = props.checked;
    checkbox.value = props.column;
    checkbox.disabled = props.disabled ?? false;
    checkbox.setAttribute('aria-label', `Toggle ${props.column} series`);
    checkbox.addEventListener('change', () => {
        props.onToggle?.(checkbox.checked);
        chip.classList.toggle('active', checkbox.checked);
    });

    const displayLabel = props.label ?? props.column;
    const colorInput = ColorInput({
        label: `Set ${displayLabel} color`,
        value: props.color,
        className: 'chip-color-picker',
        onInput: props.onColorInput,
    });

    const labelSpan = document.createElement('span');
    labelSpan.className = 'chip-label';
    labelSpan.textContent = displayLabel;

    chip.append(checkbox, colorInput, labelSpan);

    if (props.onMenuClick) {
        const menu = document.createElement('button');
        menu.type = 'button';
        menu.className = 'chip-menu-btn';
        menu.setAttribute('aria-label', props.menuLabel ?? `Menu for ${displayLabel}`);
        menu.title = props.menuLabel ?? `Menu for ${displayLabel}`;
        menu.appendChild(createDotsSvg());
        menu.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onMenuClick?.();
        });
        chip.append(menu);
    }

    return chip;
}