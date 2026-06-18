# ai/frontend/src/ui/primitives/Dropdown.md
> Custom accessible combobox primitive that upgrades native `<select>` elements and powers the app's dark-themed dropdowns.

## Interfaces
```typescript
interface DropdownOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface DropdownSetOptionsConfig {
    preferredValue?: string | null;
    emitChange?: boolean;
}

interface DropdownChangeDetail {
    value: string;
}

interface DropdownProps {
    id?: string;
    name?: string;
    label: string;
    value?: string;
    options: DropdownOption[];
    className?: string;
    disabled?: boolean;
    variant?: 'default' | 'compact' | 'chip';
    searchable?: boolean;
    searchPlaceholder?: string;
    onChange?: (value: string) => void;
}

interface DropdownController {
    root: HTMLDivElement;
    trigger: HTMLButtonElement;
    menu: HTMLDivElement;
    getValue(): string;
    setValue(value: string, options?: { emitChange?: boolean }): void;
    getOptions(): Array<Required<DropdownOption>>;
    setOptions(options: DropdownOption[], config?: DropdownSetOptionsConfig): string;
    setDisabled(disabled: boolean): void;
    focus(): void;
    open(): void;
    close(): void;
    destroy(): void;
}
```

## Functions
- `createDropdown(props: DropdownProps): DropdownController`
  - Builds the combobox + listbox DOM, wires keyboard, typeahead, focus, and document-click handlers.
- `getDropdownController(id: string): DropdownController | null`
  - Returns the controller registered for a given dropdown id.
- `upgradeSelectElement(selectEl: HTMLSelectElement): DropdownController`
  - Replaces a native `<select>` in place with a custom dropdown, copying attributes and the value.
- `upgradeSelects(root?: ParentNode): DropdownController[]`
  - Upgrades every non-multiple `<select>` in the given subtree (skips elements with `data-dropdown-skip`).
- `getDropdownValue(id: string): string`
  - Reads the current value from a custom dropdown or, as a fallback, from a native `<select>`.
- `getDropdownValueFromElement(element: Element | null): string`
  - Resolves the value for either a custom dropdown root or a native `<select>`.
- `getDropdownOptions(id: string): Array<Required<DropdownOption>>`
  - Returns the current option list for a dropdown id.
- `setDropdownValue(id: string, value: string, options?: { emitChange?: boolean }): void`
  - Updates a dropdown's value; emits `change`/`input` events when `emitChange` is set and the value changes.
- `setDropdownValueForElement(element: Element | null, value: string, options?: { emitChange?: boolean }): void`
  - Same as `setDropdownValue` but takes an arbitrary element and resolves the id from the closest dropdown root.
- `setDropdownOptions(id: string, options: DropdownOption[], config?: DropdownSetOptionsConfig): string`
  - Replaces the option list, optionally emitting a `change` event when the resolved value changes.
- `setDropdownDisabled(id: string, disabled: boolean): void`
  - Disables/enables a dropdown by id.
- `setDropdownDisabledForElement(element: Element | null, disabled: boolean): void`
  - Same as `setDropdownDisabled` but resolves the id from the closest dropdown root.

## DOM
- `.dropdown` — root container; `display: inline-flex`, transparent background.
- `.dropdown--compact` / `.dropdown--chip` — variants for toolbars and chip-style pickers.
- `.dropdown__trigger` — `<button role="combobox">` that opens the menu.
- `.dropdown__label` — selected option text.
- `.dropdown__chevron` — animated chevron icon.
- `.dropdown__menu` — absolutely-positioned listbox; opens below the trigger.
- `.dropdown__option` — selectable option row inside the menu.
- `.dropdown__search` — text input rendered at the top of the menu when `searchable: true` filters options as the user types.
- `.dropdown__empty` — italic empty state shown when the search filter matches no options.

## Behaviour
- Typeahead: printable keys (single character within a 250 ms buffer) jump to the first option whose label starts with the typed prefix; opens the menu on first match.
- Keyboard (closed): `ArrowDown`/`Enter`/`Space` open the menu; typeahead letters focus the search field if `searchable`.
- Keyboard (open): `ArrowDown`/`ArrowUp` move the active option; `Home`/`End` jump to the ends; `Enter`/`Space` select the active option; `Escape` closes; on a searchable dropdown `Escape` first clears the query, then closes on a second press.
- `setOptions` resets any active search query so the full list is visible after a refresh.

---
[1]: Select.md
