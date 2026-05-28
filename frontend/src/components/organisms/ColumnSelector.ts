import { ColorBySelect } from '../molecules/ColorBySelect.js';
import { SeriesChip } from '../molecules/SeriesChip.js';

export interface ColumnSelectorProps {
    columns: string[];
    selected: string[];
    colors: Record<string, string>;
    colorBy: string | null;
    onToggle?: (column: string, checked: boolean) => void;
    onColorInput?: (column: string, color: string) => void;
    onColorByChange?: (column: string | null) => void;
    onOpenRange?: (column: string) => void;
}

export function ColumnSelector(props: ColumnSelectorProps): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'column-selector';
    root.appendChild(ColorBySelect({
        columns: props.columns,
        value: props.colorBy,
        onChange: props.onColorByChange,
    }));
    for (const column of props.columns) {
        root.appendChild(SeriesChip({
            column,
            checked: props.selected.includes(column),
            color: props.colors[column] ?? '#00d4ff',
            onToggle: (checked) => props.onToggle?.(column, checked),
            onColorInput: (color) => props.onColorInput?.(column, color),
            onMenuClick: () => props.onOpenRange?.(column),
        }));
    }
    return root;
}
