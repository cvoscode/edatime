import { ColorBySelect } from './ColorBySelect.js';
import { renderSeriesChipList } from '../seriesChipList.js';

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

    const chipContainer = document.createElement('div');
    renderSeriesChipList({
        container: chipContainer,
        items: props.columns.map((col) => ({
            column: col,
            checked: props.selected.includes(col),
            color: props.colors[col] ?? '#00d4ff',
            onToggle: (checked: boolean) => props.onToggle?.(col, checked),
            onColorInput: (color: string) => props.onColorInput?.(col, color),
            onMenuClick: () => props.onOpenRange?.(col),
            menuLabel: `Filter range for ${col}`,
        })),
    });

    root.appendChild(chipContainer);
    root.appendChild(ColorBySelect({
        columns: props.columns,
        value: props.colorBy,
        onChange: props.onColorByChange,
    }));
    return root;
}