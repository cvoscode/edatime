/**
 * features/timeseries/colorByControl — color-by <select> creation and binding.
 *
 * Owns the "Color by" dropdown rendered inside the column-toggles area.
 * Delegated from buildColumnToggles so the chip-list and color-control
 * concerns stay cleanly separated.
 */
import { datasetState, setSelectedColorColumn, uiState } from '../../store/index.js';
import { ColorBySelect } from '../../ui/composites/ColorBySelect.js';

export interface ColorByControlOptions {
    /** Called when the user changes the color-by column. */
    onColorColumnChange: () => void;
    /** DOM id of the slot to append the color-by control into. */
    slotId?: string;
}

/**
 * Build and insert the "Color by" dropdown into the column-toggles area.
 * Clears any previous contents of the target slot before rendering.
 */
export function renderColorByControl(options: ColorByControlOptions): void {
    const { onColorColumnChange } = options;
    const slot = document.getElementById(options.slotId ?? 'timeseries-color-slot');
    if (!slot) return;
    slot.innerHTML = '';

    const metadataCols = (datasetState.metadata?.columns ?? [])
        .map((column) => String(column?.name ?? '').trim())
        .filter(Boolean);

    slot.appendChild(ColorBySelect({
        columns: metadataCols,
        value: uiState.selectedColorColumn,
        onChange: (value) => {
            setSelectedColorColumn(value || null);
            onColorColumnChange();
        },
    }));
}
