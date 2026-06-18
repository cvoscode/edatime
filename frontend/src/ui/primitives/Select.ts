import { createDropdown, type DropdownController, type DropdownOption } from './Dropdown.js';

export interface SelectProps {
    id?: string;
    label: string;
    value?: string;
    options: DropdownOption[];
    className?: string;
    variant?: 'default' | 'compact' | 'chip';
    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    onChange?: (value: string, event: Event) => void;
}

export type SelectOption = DropdownOption;
export type SelectController = DropdownController;

export function Select(props: SelectProps): HTMLElement {
    const dropdown = createDropdown({
        id: props.id,
        label: props.label,
        value: props.value,
        options: props.options,
        className: props.className,
        variant: props.variant,
        disabled: props.disabled,
        searchable: props.searchable,
        searchPlaceholder: props.searchPlaceholder,
        onChange: (value) => props.onChange?.(value, new Event('change')),
    });
    return dropdown.root;
}
