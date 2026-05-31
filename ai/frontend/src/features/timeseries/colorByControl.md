# features/timeseries/colorByControl.md
> Color-by `<select>` creation and binding. Owns the "Color by" dropdown rendered inside the column-toggles area. Delegated from buildColumnToggles so chip-list and color-control concerns stay cleanly separated.

## Interface: ColorByControlOptions
- `onColorColumnChange: () => void` — called when user changes the color-by column
- `slotId?: string` — DOM id of the slot to append the control into (default: `'timeseries-color-slot'`)

## Functions

### renderColorByControl
- `renderColorByControl(options: ColorByControlOptions): void`
  - Builds and inserts the "Color by" `<select>` into the target slot; wires change handler to `setSelectedColorColumn`.

---
[1]: ../../store/index.md