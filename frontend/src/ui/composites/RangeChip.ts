export interface RangeChipProps {
    key: string;
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    onActivate?: (key: string) => void;
}

export function RangeChip(props: RangeChipProps): HTMLDivElement {
    const chip = document.createElement('div');
    chip.className = props.className ?? 'range-chip';
    if (props.onActivate) {
        chip.classList.add('range-chip--clickable');
        chip.setAttribute('role', 'button');
        chip.tabIndex = 0;
        chip.addEventListener('click', () => props.onActivate?.(props.key));
        chip.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                props.onActivate?.(props.key);
            }
        });
    }
    if (props.ariaLabel) chip.setAttribute('aria-label', props.ariaLabel);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = props.name;
    const range = document.createElement('span');
    range.className = 'range';
    range.textContent = props.range;
    chip.append(name, range);
    return chip;
}