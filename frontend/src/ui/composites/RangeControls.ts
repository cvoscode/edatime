import { RangeChip } from './RangeChip.js';

export interface RangeControlItem {
    key: string;
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    /** Per-item onActivate — receives the item's key on activation */
    onActivate?: (key: string) => void;
}

export interface RangeControlsProps {
    items: RangeControlItem[];
}

export function RangeControls(props: RangeControlsProps): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'range-controls';
    for (const item of props.items) {
        root.appendChild(RangeChip({
            key: item.key,
            name: item.name,
            range: item.range,
            className: item.className,
            ariaLabel: item.ariaLabel,
            onActivate: item.onActivate,
        }));
    }
    return root;
}
