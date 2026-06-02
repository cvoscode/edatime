import { RangeChip } from './RangeChip.js';

export type RangeControlKind = 'static' | 'column-range' | 'filter-removal' | 'clear-all';

export interface RangeControlItem {
    key: string;
    name: string;
    range: string;
    className?: string;
    ariaLabel?: string;
    kind?: RangeControlKind;
    /** Per-item onActivate — receives the item's key on activation */
    onActivate?: (key: string) => void;
}

export interface RangeControlsProps {
    items: RangeControlItem[];
    /** Legacy top-level onActivate — kept for backward compatibility with existing tests.
     *  When present, all chips are treated as clickable and this callback receives the full item.
     *  Prefer per-item onActivate in new code. */
    onActivate?: (item: RangeControlItem) => void;
}

export function RangeControls(props: RangeControlsProps): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'range-controls';
    for (const item of props.items) {
        const hasPerItemCallback = item.onActivate !== undefined;
        const isStatic = item.kind === 'static';
        // Only make chip interactive if: (a) per-item onActivate is provided, OR
        // (b) top-level onActivate is provided AND item kind is not 'static'.
        // This lets callers explicitly mark chips as static to suppress interactivity.
        const activate = hasPerItemCallback
            ? (key: string) => item.onActivate!(key)
            : !isStatic && props.onActivate
                ? () => props.onActivate!(item)
                : undefined;
        root.appendChild(RangeChip({
            key: item.key,
            name: item.name,
            range: item.range,
            className: item.className,
            ariaLabel: item.ariaLabel,
            onActivate: activate,
        }));
    }
    return root;
}