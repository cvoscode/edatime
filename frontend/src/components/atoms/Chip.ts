export interface ChipProps {
    label: string;
    className?: string;
    active?: boolean;
    accent?: string;
    onClick?: (event: MouseEvent) => void;
}

export function Chip(props: ChipProps): HTMLSpanElement {
    const chip = document.createElement('span');
    chip.className = props.className ?? 'chip';
    if (props.active) chip.classList.add('active');
    if (props.accent) chip.style.setProperty('--chip-accent', props.accent);
    chip.textContent = props.label;
    if (props.onClick) chip.addEventListener('click', props.onClick);
    return chip;
}
