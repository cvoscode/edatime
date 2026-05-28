import { RangeChip } from '../molecules/RangeChip.js';

export interface RangeControlItem {
    name: string;
    range: string;
    ariaLabel?: string;
}

export interface RangeControlsProps {
    items: RangeControlItem[];
    onActivate?: (item: RangeControlItem) => void;
}

export function RangeControls(props: RangeControlsProps): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'range-controls';
    for (const item of props.items) {
        root.appendChild(RangeChip({
            ...item,
            onActivate: props.onActivate ? () => props.onActivate?.(item) : undefined,
        }));
    }
    return root;
}
