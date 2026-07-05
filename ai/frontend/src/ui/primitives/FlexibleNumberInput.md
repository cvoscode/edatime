# frontend/src/ui/primitives/FlexibleNumberInput.ts
> Numeric input upgrader that stores flexible min/max/step metadata and normalizes the control for consistent numeric entry.

## Functions
- `setupFlexibleNumberInput(input: HTMLInputElement, options?: { min?: number; max?: number; step?: number; value?: number }): HTMLInputElement`
  - Initializes a flexible number input, seeds data attributes, and sets `lang="en-US"` when absent.
- `upgradeFlexibleNumberInputs(root?: ParentNode): HTMLInputElement[]`
  - Upgrades eligible numeric inputs under `root` and returns the upgraded elements.
