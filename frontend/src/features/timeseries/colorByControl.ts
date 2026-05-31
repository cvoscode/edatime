/**
 * features/timeseries/colorByControl — color-by <select> creation and binding.
 *
 * Owns the "Color by" dropdown rendered inside the column-toggles area.
 * Delegated from buildColumnToggles so the chip-list and color-control
 * concerns stay cleanly separated.
 */
import { appStateComposite as appState } from '../../store/index.js';
import { setSelectedColorColumn } from '../../store/index.js';

export interface ColorByControlOptions {
    /** Called when the user changes the color-by column. */
    onColorColumnChange: () => void;
    /** DOM id of the slot to append the color-by control into. */
    slotId?: string;
}

/**
 * Build and insert the "Color by" <select> control into the column-toggles area.
 * Clears any previous contents of the target slot before rendering.
 */
export function renderColorByControl(options: ColorByControlOptions): void {
    const { onColorColumnChange } = options;
    const slot = document.getElementById(options.slotId ?? 'timeseries-color-slot');
    if (!slot) return;
    slot.innerHTML = '';

    const control = document.createElement('div');
    control.className = 'series-color-selector';
    control.innerHTML = `
    <label>
      <span>Color by</span>
      <select id="color-column-select" name="color-column-select" aria-label="Color-by column"></select>
    </label>
  `;
    slot.appendChild(control);

    const select = control.querySelector('#color-column-select') as HTMLSelectElement | null;
    if (!select) return;

    select.innerHTML = '<option value="">None</option>';
    const metadataCols = (appState.metadata?.columns ?? []).map((c) => ({
        name: c?.name,
        dtype: c?.dtype,
    }));

    for (const col of metadataCols) {
        const name = String(col.name ?? '').trim();
        if (!name) continue;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === appState.selectedColorColumn) opt.selected = true;
        select.appendChild(opt);
    }

    select.addEventListener('change', () => {
        setSelectedColorColumn(select.value || null);
        onColorColumnChange();
    });
}