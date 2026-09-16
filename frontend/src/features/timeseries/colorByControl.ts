/**
 * features/timeseries/colorByControl — color-by <select> creation and binding.
 *
 * Owns the "Color by" dropdown rendered inside the column-toggles area.
 * Delegated from buildColumnToggles so the chip-list and color-control
 * concerns stay cleanly separated.
 */
import { ColorBySelect } from '../../ui/composites/ColorBySelect.js';
import type { SelectionWorkspace } from './selectionIntent.js';
import { getEffectiveColumnNames, getEffectiveNumericColumns } from '../../platform/analyticsColumns.js';
import { cleaningPlanStore } from '../../cleaning/store.js';

export interface ColorByControlOptions {
    workspace: SelectionWorkspace;
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

    const metadataCols = getEffectiveColumnNames(options.workspace.getSnapshot().dataset.metadata, cleaningPlanStore.getSnapshot());

    const control = ColorBySelect({
        columns: metadataCols,
        value: options.workspace.getSnapshot().selection.colorColumn,
        onChange: (value) => {
            const snapshot = options.workspace.getSnapshot();
            const numericColumns = new Set(getEffectiveNumericColumns(snapshot.dataset.metadata, cleaningPlanStore.getSnapshot()));
            const selectedColumns = value && numericColumns.has(value) && !snapshot.selection.columns.includes(value)
                ? [...snapshot.selection.columns, value]
                : snapshot.selection.columns;
            options.workspace.setSelection(
                selectedColumns,
                value || null,
            );
            onColorColumnChange();
        },
    });
    control.title = 'Color every visible line segment using values from this column. Numeric color columns are also added as toggleable series.';
    slot.appendChild(control);
}
